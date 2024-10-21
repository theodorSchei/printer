import escpos, { Adapter, Image } from 'escpos';
import { SerialPort } from 'serialport';
import sharp from 'sharp';
import fs from 'fs/promises';

const PROCESSED_IMAGE_PATH = './dist/toPrint.png';
const PORT_NAME = '/dev/ttyUSB0';

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

async function captureAndPrint(printer: escpos.Printer) {
  
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

    console.log(await SerialPort.list());

    const printer = new escpos.Printer(device as unknown as Adapter);


    await printImage('./img/1758.jpg', printer);
    printer
      .flush()
      .feed()
      .font('B')
      .align('CT')
      .style('NORMAL')
      .size(1, 1)
      .text('Fagdagen 25.10.2025')
      .feed(3);

    console.log('Text printed successfully');

    printer.cut(true, 2).flush(() => {
      console.log('Finished printing');
      device.close();
    });
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();
