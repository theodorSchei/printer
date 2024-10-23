import asyncio
from escpos.printer import Network
from PIL import Image
import io
import numpy as np

# Constants
IMAGE_PATH = "./img/photo2.jpg"
PROCESSED_IMAGE_PATH = "./dist/toPrint.png"
# PORT_NAME = "COM4"
# PORT_NAME = '/dev/cu.usbserial-21430'
PORT_NAME = "/dev/ttyUSB0"
PORT_NAME = "/dev/tty.usbserial-B003KW0I"


def floyd_steinberg_dithering(image):
    """
    Apply Floyd-Steinberg dithering to an image.

    Args:
        image: PIL Image in "L" (grayscale) mode
    Returns:
        PIL Image with dithering applied
    """
    # Convert image to numpy array
    img_array = np.array(image, dtype=float)
    height, width = img_array.shape

    # Process each pixel
    for y in range(height):
        for x in range(width):
            old_pixel = img_array[y, x]
            new_pixel = 255 if old_pixel > 128 else 0
            img_array[y, x] = new_pixel

            error = old_pixel - new_pixel

            # Distribute error to neighboring pixels
            if x + 1 < width:
                img_array[y, x + 1] += error * 7 / 16
            if y + 1 < height:
                if x - 1 >= 0:
                    img_array[y + 1, x - 1] += error * 3 / 16
                img_array[y + 1, x] += error * 5 / 16
                if x + 1 < width:
                    img_array[y + 1, x + 1] += error * 1 / 16

    return Image.fromarray(img_array.astype(np.uint8))


async def process_image():
    try:
        with Image.open(IMAGE_PATH) as img:
            # Resize image
            # Calculate height to maintain aspect ratio
            width = 512
            ratio = width / img.size[0]
            height = int(img.size[1] * ratio)
            img = img.resize((width, height))

            # Convert to grayscale
            img = img.convert("L")

            # Apply dithering
            dithered = floyd_steinberg_dithering(img)

            # Convert to binary (1-bit) image
            dithered = dithered.convert("1")

            # Save processed image
            dithered.save(PROCESSED_IMAGE_PATH)

        print("Image processed and saved successfully")
    except Exception as e:
        print(f"Error processing image: {e}")
        raise


async def print_image(printer: Network):
    try:
        # Load and print the image
        printer.image(PROCESSED_IMAGE_PATH)
        print("Image printed successfully")
    except Exception as e:
        print(f"Error printing image: {e}")


async def print_footer(printer: Network):
    try:
        printer.ln(2)
        printer.set(font="a", align="center", width=2, height=2)
        printer.text("Fagdagen 25.10.2025")
        printer.ln()
        printer.cut()
    except Exception as e:
        print(f"Error printing footer: {e}")


async def main():
    try:
        printer = Network("192.168.0.237")
        await process_image()
        await print_image(printer)
        await print_footer(printer)
    except Exception as e:
        print(f"An error occurred: {e}")


if __name__ == "__main__":
    asyncio.run(main())
