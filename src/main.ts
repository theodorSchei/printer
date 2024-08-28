import escpos, { Image } from 'escpos';
import { SerialPort } from 'serialport';
import sharp from 'sharp';
import fs from 'fs/promises';
import { AutoDetectTypes } from '@serialport/bindings-cpp';
import { EventEmitter } from 'events';

const PROCESSED_IMAGE_PATH = './toPrint.png';
const PORT_NAME = '/dev/cu.usbserial-21440';

class SerialPortAdapter extends EventEmitter implements escpos.Adapter {
  device: SerialPort<AutoDetectTypes> | null;

  constructor(port: string, options?: any) {
    super();
    var self = this;
    options = options || {
      path: port,
      baudRate: 9600,
      databits: 8,
      autoOpen: true,
    };

    this.device = new SerialPort(options);

    this.device.on('open', () => console.log('Serial port opened successfully'));
    this.device.on('close', () => {
      console.log('Serial port closed successfully');
      self.emit('disconnect', this.device);
      self.device = null;
    });
    this.device.on('data', (data) => console.log('Received data:', data.toString()));
    this.device.on('error', (err) => console.error('Serial port error:', err.message));

    EventEmitter.call(this);
  }
  open(callback?: (error?: any) => void): SerialPortAdapter {
    this.device && this.device.open(callback);
    return this;
  }
  write(data: Buffer, callback?: (error?: any) => void): SerialPortAdapter {
    this.device && this.device.write(data, callback);
    return this;
  }
  close(callback?: (error: any, device: SerialPortAdapter | null) => void, timeout?: number): SerialPortAdapter {
    var self = this;

    this.device &&
      this.device.drain(() => {
        self.device &&
          self.device.flush((err) => {
            setTimeout(
              () => {
                err
                  ? callback && callback(err, self)
                  : self.device &&
                    self.device.close(function (err) {
                      self.device = null;
                      return callback && callback(err, self.device);
                    });
              },
              'number' === typeof timeout && 0 < timeout ? timeout : 0,
            );
          });
      });
    return this;
  }
}

async function processImage(image_path: string) {
  try {
    const data = await sharp(image_path)
      .resize(128)
      .normalise()
      .greyscale()
      .png({
        dither: 1,
        colours: 2,
      })
      .toBuffer();
    await sharp(data).threshold(128, { grayscale: true }).toFile(PROCESSED_IMAGE_PATH);
    console.log('Image processed and saved successfully');
  } catch (err) {
    console.error('Error processing image:', err);
    throw err;
  }
}

function loadImage(filePath: string): Promise<Image> {
  return new Promise((resolve, reject) => {
    escpos.Image.load(filePath, (image) => {
      if (image instanceof Error) {
        reject(image);
      } else {
        resolve(image);
      }
    });
  });
}

async function printImage(image_path: string, printer: escpos.Printer) {
  try {
    await processImage(image_path);

    const image = await loadImage(PROCESSED_IMAGE_PATH);
    console.log('Image loaded successfully');
    printer.font('B').align('CT').image(image, 'D24');
    console.log('Image printed successfully');

    // Clean up the temporary processed image file
    console.log('Cleaning up temporary files...');
    await fs.unlink(PROCESSED_IMAGE_PATH);
    console.log('Temporary files cleaned up successfully');
  } catch (error) {
    console.error('An error occurred during image processing or printing:', error);
  }
}

async function main() {
  console.log('Starting...');
  try {
    const device = new SerialPortAdapter(PORT_NAME);
    const printer = new escpos.Printer(device, { encoding: 'GB18030' });

    await printImage('./1758.jpg', printer);

    console.log('Printing text...');
    printer
      .font('B')
      .align('CT')
      .style('NORMAL')
      .size(1, 1)
      .text('Hello, World!')
      .text('Hello, World!')
      .text('Hello')
      .feed(3)
      .cut(true)
      .flush(() => {
        console.log('Printer flushed');
      });

    await printImage('./1758.jpg', printer);
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();
