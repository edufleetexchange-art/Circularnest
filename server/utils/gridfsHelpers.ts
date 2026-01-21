import { Readable } from 'stream';
import { getGridFSBucket } from '../config/gridfs';
import mongoose from 'mongoose';

export const uploadToGridFS = (
  buffer: Buffer,
  filename: string,
  contentType: string = 'application/pdf'
): Promise<mongoose.Types.ObjectId> => {
  return new Promise((resolve, reject) => {
    try {
      const bucket = getGridFSBucket();
      const uploadStream = bucket.openUploadStream(filename, {
        contentType
      });

      const readableStream = Readable.from(buffer);
      
      readableStream.pipe(uploadStream)
        .on('error', (error) => {
          console.error('Upload stream error:', error);
          reject(new Error(`GridFS upload failed: ${error.message}`));
        })
        .on('finish', () => {
          console.log('GridFS upload finished for file:', filename, 'fileId:', uploadStream.id);
          resolve(uploadStream.id as mongoose.Types.ObjectId);
        });
    } catch (error: any) {
      console.error('Error in uploadToGridFS:', error);
      reject(new Error(`Failed to initialize upload: ${error.message}`));
    }
  });
};

export const downloadFromGridFS = (fileId: mongoose.Types.ObjectId): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const bucket = getGridFSBucket();
      const chunks: Buffer[] = [];
      
      const downloadStream = bucket.openDownloadStream(fileId);
      
      downloadStream
        .on('data', (chunk) => {
          chunks.push(chunk);
        })
        .on('error', (error) => {
          console.error('Download stream error:', error);
          reject(new Error(`GridFS download failed: ${error.message}`));
        })
        .on('end', () => {
          console.log('GridFS download completed for fileId:', fileId);
          resolve(Buffer.concat(chunks));
        });
    } catch (error: any) {
      console.error('Error in downloadFromGridFS:', error);
      reject(new Error(`Failed to initialize download: ${error.message}`));
    }
  });
};

export const deleteFromGridFS = async (fileId: mongoose.Types.ObjectId): Promise<void> => {
  try {
    const bucket = getGridFSBucket();
    await bucket.delete(fileId);
    console.log('GridFS file deleted:', fileId);
  } catch (error: any) {
    console.error('Error deleting from GridFS:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

export const getFileMetadata = async (fileId: mongoose.Types.ObjectId) => {
  try {
    const bucket = getGridFSBucket();
    const files = await bucket.find({ _id: fileId }).toArray();
    return files.length > 0 ? files[0] : null;
  } catch (error: any) {
    console.error('Error getting file metadata:', error);
    throw new Error(`Failed to get file metadata: ${error.message}`);
  }
};
