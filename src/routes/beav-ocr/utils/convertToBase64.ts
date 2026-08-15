export async function convertToBase64(file: File) {
    try {
        const arrayBuffer = await file.arrayBuffer();

        const base64String = Buffer.from(arrayBuffer).toString('base64');

        return base64String;
    } catch (error) {
        console.error(error);
        return null;
    }
}