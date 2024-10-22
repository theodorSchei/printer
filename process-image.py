from PIL import Image


PROCESSED_IMAGE_PATH = "./dist/toPrint.png"

async def process_image(image_path):
    try:
        with Image.open(image_path) as img:
            # Resize, convert to grayscale
            img = img.resize((512, 512)).convert("L")

            # Apply threshold
            img = img.point(lambda x: 0 if x < 128 else 255, "1")

            # Save processed image
            img.save(PROCESSED_IMAGE_PATH)

        print("Image processed and saved successfully")

				return PROCESSED_IMAGE_PATH
    except Exception as e:
        print(f"Error processing image: {e}")
        raise