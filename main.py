import asyncio
from escpos.printer import Serial
from PIL import Image
import io

# Constants
IMAGE_PATH = "./1758.jpg"
PROCESSED_IMAGE_PATH = "./toPrint.png"
PORT_NAME = "COM4"
PORT_NAME = '/dev/cu.usbserial-21430'


async def process_image():
    try:
        with Image.open(IMAGE_PATH) as img:
            # Resize, convert to grayscale
            img = img.resize((128, 128)).convert("L")

            # Apply threshold
            img = img.point(lambda x: 0 if x < 128 else 255, "1")

            # Save processed image
            img.save(PROCESSED_IMAGE_PATH)

        print("Image processed and saved successfully")
    except Exception as e:
        print(f"Error processing image: {e}")
        raise


async def print_image():
    try:
        # Initialize the printer
        printer = Serial(
            devfile=PORT_NAME,
            baudrate=9600,
            bytesize=8,
            parity="N",
            stopbits=1,
            timeout=1.00,
            dsrdtr=True,
        )

        # Load and print the image
        printer.image(PROCESSED_IMAGE_PATH)

        # Additional text and formatting
        printer.set(font="b", align="center", width=1, height=1)
        printer.text("\n")  # Line feed
        printer.cut()

        print("Image printed successfully")
    except Exception as e:
        print(f"Error printing image: {e}")
    finally:
        if "printer" in locals():
            printer.close()
            print("Printer closed successfully")


async def main():
    try:
        await process_image()
        await print_image()
    except Exception as e:
        print(f"An error occurred: {e}")


if __name__ == "__main__":
    asyncio.run(main())