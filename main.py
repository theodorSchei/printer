import asyncio
import os
import time
from datetime import datetime
from pathlib import Path

import numpy as np
from escpos.printer import Network
from PIL import Image
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer


class PhotoBoothHandler(FileSystemEventHandler):
    def __init__(self, printer):
        self.printer = printer
        self.processing = False
        # Keep track of processed files
        self.processed_files = set()

    def on_created(self, event):
        if event.is_directory:
            return
        if event.src_path.lower().endswith((".jpg", ".jpeg", ".png")):
            # Wait a brief moment to ensure the file is completely written
            time.sleep(1)
            asyncio.run(self.process_and_print(event.src_path))

    async def process_and_print(self, image_path):
        if image_path in self.processed_files:
            return

        try:
            print(f"Processing new image: {image_path}")
            self.processing = True

            # Process the image
            processed_path = await process_image(image_path)

            # Print the image
            await print_image(self.printer, processed_path)

            # Print footer with timestamp
            await print_footer(self.printer)

            # Mark file as processed
            self.processed_files.add(image_path)
            print(f"Successfully printed image: {image_path}")

        except Exception as e:
            print(f"Error processing/printing image: {e}")
        finally:
            self.processing = False


def floyd_steinberg_dithering(image):
    """
    Apply Floyd-Steinberg dithering to an image.
    """
    img_array = np.array(image, dtype=float)
    height, width = img_array.shape

    for y in range(height):
        for x in range(width):
            old_pixel = img_array[y, x]
            new_pixel = 255 if old_pixel > 128 else 0
            img_array[y, x] = new_pixel

            error = old_pixel - new_pixel

            if x + 1 < width:
                img_array[y, x + 1] += error * 7 / 16
            if y + 1 < height:
                if x - 1 >= 0:
                    img_array[y + 1, x - 1] += error * 3 / 16
                img_array[y + 1, x] += error * 5 / 16
                if x + 1 < width:
                    img_array[y + 1, x + 1] += error * 1 / 16

    return Image.fromarray(img_array.astype(np.uint8))


async def process_image(image_path):
    """
    Process a single image for printing.
    Returns the path to the processed image.
    """
    try:
        # Create dist directory if it doesn't exist
        os.makedirs("dist", exist_ok=True)

        # Generate unique filename for processed image
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        processed_path = f"dist/processed_{timestamp}.png"

        with Image.open(image_path) as img:
            # Resize image
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
            dithered.save(processed_path)

        print(f"Image processed and saved to {processed_path}")
        return processed_path
    except Exception as e:
        print(f"Error processing image: {e}")
        raise


async def print_image(printer, image_path):
    """Print a single image."""
    try:
        printer.image(image_path)
        print("Image printed successfully")
    except Exception as e:
        print(f"Error printing image: {e}")
        raise


async def print_footer(printer):
    """Print footer with timestamp."""
    try:
        printer.ln(2)
        printer.set(font="a", align="center", width=2, height=2)
        # timestamp = datetime.now().strftime("%d.%m.%Y %H:%M")
        printer.text("Sommerfagkveld 23.07.25 <3")
        printer.ln()
        printer.cut()
    except Exception as e:
        print(f"Error printing footer: {e}")
        raise


async def main():
    # Printer configuration
    PRINTER_IP = "192.168.0.237"
    PHOTO_BOOTH_DIR = str(Path.home() / "Pictures/Photo Booth Library/Pictures")

    try:
        # Initialize printer
        print(f"Connecting to printer at {PRINTER_IP}")
        printer = Network(PRINTER_IP)
        print("Printer connected successfully")

        # Create and configure the event handler
        event_handler = PhotoBoothHandler(printer)

        # Set up the observer
        observer = Observer()
        observer.schedule(event_handler, PHOTO_BOOTH_DIR, recursive=False)
        observer.start()

        print(f"Monitoring directory: {PHOTO_BOOTH_DIR}")
        print("Waiting for new photos... (Press Ctrl+C to stop)")

        # Keep the script running
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            observer.stop()
            print("\nStopping monitor...")

        observer.join()

    except Exception as e:
        print(f"An error occurred: {e}")


if __name__ == "__main__":
    asyncio.run(main())
