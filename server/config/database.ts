import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://noticenext:uxNIQa4VZpw02DtB@cluster0.lpjvk8x.mongodb.net/NOTICENEST?retryWrites=true&w=majority&appName=NOTICE_NEST');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.log("error" + process.env.MONGODB_URI);
    console.log("ERRROR CONNECTING TO MONGODB");
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};
