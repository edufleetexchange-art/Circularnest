import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';

let bucket: GridFSBucket | null = null;

export const initGridFS = () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.warn('MongoDB connection not in ready state (readyState:', mongoose.connection.readyState, ')');
      throw new Error('MongoDB connection not established. Connection state: ' + mongoose.connection.readyState);
    }

    if (!mongoose.connection.db) {
      throw new Error('MongoDB connection.db is null');
    }

    bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'uploads'
    });
    console.log('GridFS initialized successfully');
  } catch (error: any) {
    console.error('Error initializing GridFS:', error.message);
    throw error;
  }
};

export const getGridFSBucket = (): GridFSBucket => {
  if (!bucket) {
    // Check connection state before attempting to get bucket
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB connection not ready. Current state:', mongoose.connection.readyState);
      throw new Error('MongoDB connection not ready. Please try again.');
    }
    
    try {
      initGridFS();
    } catch (error: any) {
      console.error('Failed to initialize GridFS on demand:', error.message);
      throw error;
    }
  }
  
  if (!bucket) {
    throw new Error('GridFS not initialized. Connection might have failed.');
  }
  
  return bucket;
};
