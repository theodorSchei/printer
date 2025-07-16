import os
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image

PROCESSED_IMAGE_PATH = "./dist/toPrint.png"


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


def create_image_grid(input_dir, output_path, images_per_row=20):
    # Get all image files
    image_files = [
        f
        for f in os.listdir(input_dir)
        if f.lower().endswith((".png", ".jpg", ".jpeg"))
    ]

    # Open all images and get their sizes
    images = [Image.open(os.path.join(input_dir, f)) for f in image_files]

    # Calculate grid dimensions
    n_images = len(images)
    n_rows = (n_images + images_per_row - 1) // images_per_row

    # Resize images to a common size (optional)
    thumb_width = 512
    thumb_height = 341
    thumbnails = [img.resize((thumb_width, thumb_height)) for img in images]

    # Create the final image
    grid_width = images_per_row * thumb_width
    grid_height = n_rows * thumb_height
    grid_image = Image.new("RGB", (grid_width, grid_height), "white")

    # Paste images into grid
    for idx, img in enumerate(thumbnails):
        row = idx // images_per_row
        col = idx % images_per_row
        grid_image.paste(img, (col * thumb_width, row * thumb_height))

    # Save the result
    grid_image.save(output_path)


PHOTO_BOOTH_DIR = str(Path.home() / "Pictures/Photo Booth Library/Pictures")
GALLERY = "/Users/theodor/Downloads/dist"
if __name__ == "__main__":
    # asyncio.run(process_image("./img/test.jpg"))
    create_image_grid(GALLERY, "./dist/gallery.jpg", 15)
