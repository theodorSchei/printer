import escpos, { Adapter, Image } from 'escpos';
// escpos.Network = require('escpos-network');
import { SerialPort } from 'serialport';
import sharp from 'sharp';
import fs from 'fs';
import util from 'util';
const exec = util.promisify(require('child_process').exec);

const PROCESSED_IMAGE_PATH = './dist/toPrint.png';
const LAST_IMAGE_PATH = './img/capture.jpg';
// const PORT_NAME = '/dev/ttyUSB0';
const PORT_NAME = '/dev/tty.usbserial-B003KW0I';

async function processImage(image_path: string) {
  try {
    const data = await sharp(image_path)
      .resize(512)
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

function loadImage(): Promise<Image> {
  return new Promise((resolve, reject) => {
    escpos.Image.load(PROCESSED_IMAGE_PATH, (image) => {
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

    const image = await loadImage();

    console.log('Image loaded successfully');
    printer.image(image, 'D24');
    console.log('Image printed successfully');
  } catch (error) {
    console.error('An error occurred during image processing or printing:', error);
  }
}


/**
 * Split an image into multiple files, each containing a @param height px high line
 * @param image_path Path to the image to split
 * @param height Height of each line
 * @returns Array of paths to the split images
 * @throws Error if an error occurs during image processing
 */
async function splitImage(image_path: string, height: number): Promise<string[]> {
  try {
    // Load the image and get its metadata
    const image = sharp(image_path);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Image metadata is missing');
    }

    const { width, height: originalHeight } = metadata;
    console.log(`Original image dimensions: ${width}x${originalHeight}`);
    console.log(`Splitting into chunks of height: ${height}`);

    const parts: string[] = [];
    let currentY = 0;

    while (currentY < originalHeight) {
      // Calculate the height for this segment
      const remainingHeight = originalHeight - currentY;
      const segmentHeight = Math.min(height, remainingHeight);

      // Validate extraction parameters
      if (currentY >= originalHeight || segmentHeight <= 0) {
        break;
      }

      const extractConfig = {
        left: 0,
        top: currentY,
        width: width,
        height: segmentHeight
      };

      console.log(`Extracting segment at y=${currentY} with height=${segmentHeight}`);
      console.log('Extraction config:', extractConfig);

      const fileName = `${image_path}_${currentY}.png`;

      // Create a new Sharp instance for each extraction
      await sharp(image_path)
        .extract(extractConfig)
        .toFile(fileName);

      parts.push(fileName);
      console.log(`Successfully created part ${parts.length}: ${fileName}`);

      currentY += segmentHeight;
    }

    if (parts.length === 0) {
      throw new Error('No image parts were created');
    }

    console.log(`Successfully split image into ${parts.length} parts`);
    return parts;

  } catch (err) {
    console.error('Error splitting image:', err);
    throw err;
  }
}

/**
 * Waits for the printer to be ready using DTR/DSR handshaking
 * @param printer The printer instance
 * @returns Promise that resolves when printer is ready
 */
function waitForPrinter(printer: escpos.Printer): Promise<void> {
  return new Promise((resolve, reject) => {
    // Try to get the underlying device
    const device = (printer as any).adapter?.device;
    if (!device?.dsr) {
      // If we can't access DSR, use a timeout instead
      setTimeout(resolve, 100);
      return;
    }

    // Check DSR signal
    const checkDSR = () => {
      device.dsr((ready: boolean) => {
        if (ready) {
          resolve();
        } else {
          // Check again in 100ms
          setTimeout(checkDSR, 100);
        }
      });
    };

    checkDSR();
  });
}

async function printImageInLines(image_path: string, printer: escpos.Printer): Promise<void> {
  try {
    // Process image
    await processImage(image_path);

    // Split into smaller chunks
    const parts = await splitImage(PROCESSED_IMAGE_PATH, 24);  // 24px chunks
    console.log(`Starting to print ${parts.length} image parts`);

    // Print each part with hardware flow control
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      console.log(`Loading part ${i + 1}/${parts.length}`);

      // Load the image
      const image = await new Promise<Image>((resolve, reject) => {
        escpos.Image.load(part, (image) => {
          if (image instanceof Error) {
            reject(image);
          } else {
            resolve(image);
          }
        });
      });

      console.log(`Printing part ${i + 1}/${parts.length}`);

      // Wait for printer to be ready
      await waitForPrinter(printer);

      // Print with careful buffer management
      await new Promise<void>((resolve, reject) => {
        try {
          // Print sequence for this chunk
          printer
            .image(image, 'D24');  // Print image

          // Flush and wait for completion
          printer.flush(async (error) => {
            if (error) {
              reject(error);
            } else {
              // Wait for printer to finish processing
              await waitForPrinter(printer);
              resolve();
            }
          });
        } catch (error) {
          reject(error);
        }
      });

      // Delete the temporary file right after printing
      try {
        fs.unlinkSync(part);
      } catch (error) {
        console.warn(`Failed to clean up file ${part}:`, error);
      }
    }

    // Final operations with flow control
    await waitForPrinter(printer);
    await new Promise<void>((resolve) => {
      printer.flush(() => resolve());
    });

    console.log('Image printed successfully');

  } catch (error) {
    console.error('An error occurred during image processing or printing:', error);
    throw error;
  }
}

async function captureAndPrint(printer: escpos.Printer) {
  console.log('Capturing image');
  const { stdout, stderr } = await exec(
    `rpicam-jpeg --output ${LAST_IMAGE_PATH} --immediate -t 3000 --hflip --fullscreen --ev 9 --brightness 0.5 --rotation 180 `,
  );
  await printLastCapture(printer);
}

async function printLastCapture(printer: escpos.Printer) {
  try {
    console.log('Processing image');
    await processImage(LAST_IMAGE_PATH);
    console.log('Loading image');
    const image = await loadImage();
    console.log('Printing image');
    printer.font('B').align('CT').image(image, 'D24');
  } catch (error) {
    console.error('An error occurred during image processing or printing:', error);
  }
}

async function main() {
  console.log('Starting...');
  try {
    // const device = new SerialPortAdapter(PORT_NAME);
    
    const device = new SerialPort({
      path: PORT_NAME,
      baudRate: 115200,
      autoOpen: true,
      dataBits: 8,
      parity: 'none',
      lock: true,
    });
    

    //const device = new escpos.Network('192.168.0.237', 9100);

    console.log(await SerialPort.list());

    // const printer = new escpos.Printer(device as unknown as Adapter);
    const printer = new escpos.Printer(device as unknown as Adapter);

    await printImage('./img/photo2.jpg', printer);
    // await printImageInLines('./img/photo2.jpg', printer);
    // await captureAndPrint(printer)

    printer.flush();
    await waitForPrinter(printer);
    printer.flush(() =>
      printer.feed().font('B').align('CT').style('NORMAL').size(1, 1).text('Fagdagen 25.10.2025').feed(3),
    );

    await waitForPrinter(printer);
    console.log('Text printed successfully');

    printer.cut().flush(() => {
      console.log('Finished printing');
      // device.close();
    });
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();
