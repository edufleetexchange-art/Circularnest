import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/educircular');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.log("error" + process.env.MONGODB_URI);
    console.log("ERRROR CONNECTING TO MONGODB");
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};
