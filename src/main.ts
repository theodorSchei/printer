import escpos, { Image } from 'escpos';
import { SerialPort } from 'serialport';
import sharp from 'sharp';
import fs from 'fs/promises';
import { AutoDetectTypes } from '@serialport/bindings-cpp';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import path from 'path';

const PROCESSED_IMAGE_PATH = './dist/toPrint.png';
const PORT_NAME = '/dev/cu.usbserial-21440';
const PHOTO_BOOTH_DIR = path.join(process.env.HOME || '', 'Pictures', 'Photo Booth Library', 'Pictures');

class SerialPortAdapter extends EventEmitter implements escpos.Adapter {
  device: SerialPort<AutoDetectTypes> | null;

  constructor(port: string, options?: any) {
    super();
    var self = this;
    options = options || {
      path: port,
      // baudRate: 9600,
      baudRate: 38400,
      databits: 8,
      autoOpen: false, // Changed to false to manually open for each print job
    };

    this.device = new SerialPort(options);

    this.device.on('open', () => console.log('Serial port opened successfully'));
    this.device.on('data', (data) => console.log('Received data:', data.toString()));
    this.device.on('error', (err) => {
      console.error('Serial port error:', err.message);
      self.emit('disconnect', this.device);
    });
    this.device.on('close', () => {
      console.log('Serial port closed successfully');
      self.emit('disconnect', this.device);
      self.device = null;
    });

    EventEmitter.call(this);
  }

  open(callback?: (error?: any) => void): SerialPortAdapter {
    console.log('Attempting to open serial port...');
    this.device && this.device.open(callback);
    return this;
  }

  write(data: Buffer, callback?: (error?: any) => void): SerialPortAdapter {
    console.log('Writing data to serial port:', data);
    this.device && this.device.write(data, callback);

    this.device &&
      this.device.drain(() => {
        console.log('Drained serial port after writing data');
      });
    return this;
  }

  close(callback?: (error: any, device: SerialPortAdapter | null) => void, timeout?: number): SerialPortAdapter {
    console.log('Attempting to close serial port...');
    var self = this;

    this.device &&
      this.device.drain(() => {
        self.device &&
          self.device.flush((err) => {
            setTimeout(
              () => {
                if (err) {
                  console.error('Error during flushing:', err);
                  callback && callback(err, self);
                } else {
                  self.device &&
                    self.device.close((err) => {
                      if (err) {
                        console.error('Error during closing:', err);
                      }
                      self.device = null;
                      callback && callback(err, self.device);
                    });
                }
              },
              typeof timeout === 'number' && timeout > 0 ? timeout : 0,
            );
          });
      });
    return this;
  }
}

async function processAndPrintImage(imagePath: string) {
  console.log(`Processing image: ${imagePath}`);
  try {
    const data = await sharp(imagePath)
      .resize(256)
      .normalise()
      .greyscale()
      .png({
        dither: 1,
        colours: 2,
      })
      .toBuffer();

    await sharp(data).threshold(128, { grayscale: true }).toFile(PROCESSED_IMAGE_PATH);

    console.log('Image processed and saved successfully');

    const device = new SerialPortAdapter(PORT_NAME);
    const printer = new escpos.Printer(device, { encoding: 'GB18030' });

    await new Promise<void>((resolve, reject) => {
      escpos.Image.load(PROCESSED_IMAGE_PATH, (image) => {
        if (image instanceof Error) {
          console.error('Error loading image:', image);
          reject(image);
          return;
        }
        device.open(() => {
          printer.align('CT').image(image, 'D24');
          printer.feed(2).cut().flush(() => {
            console.log('Image printed successfully');
            // Close the connection after printing
            setTimeout(() => {
              printer.close((err) => {
                if (err) {
                  console.error('Error closing device:', err);
                }
                resolve();
              });
              // 256w image takes about 10 seconds to print from mac
            }, 10000);
          });
        });
      });
    });

    // Delete the processed image after printing
    await fs.unlink(PROCESSED_IMAGE_PATH);
  } catch (error) {
    console.error('An error occurred while processing and printing the image:', error);
  }
}

async function main() {
  console.log('Starting Photo Booth Printer...');
  try {
    // Set up file watcher
    const watcher = chokidar.watch(PHOTO_BOOTH_DIR, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      awaitWriteFinish: true,
    });

    // Wait for the initial scan to complete
    await new Promise<void>((resolve) => {
      watcher.on('ready', () => {
        console.log('Initial scan complete. Ready to watch for new images.');
        resolve();
      });
    });

    // Now start watching for new files
    watcher
      .on('add', async (filePath) => {
        console.log(`New image detected: ${filePath}`);
        await processAndPrintImage(filePath);
      })
      .on('error', (error) => console.error(`Watcher error: ${error}`));

    console.log(`Watching for new images in: ${PHOTO_BOOTH_DIR}`);

    // Keep the script running
    process.stdin.resume();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down...');
      watcher.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();
