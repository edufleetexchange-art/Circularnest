import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
// Adjust the import according to your actual export in ../models/User
// If it's a default export:
import User from '../models/User';
// Or if it's a named export with a different name, e.g. userModel:
// import { userModel as User } from '../models/User';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educircular';

// Predefined admin accounts (only these can access admin panel)
const ADMIN_ACCOUNTS = [
  {
    email: 'admin@educircular.com',
    password: 'Admin@2025!Secure',
    role: 'admin'
  },
  {
    email: 'superadmin@educircular.com',
    password: 'SuperAdmin@2025!Secure',
    role: 'admin'
  }
];

const seedAdmin = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('\n🔧 Seeding admin accounts...\n');

    for (const adminData of ADMIN_ACCOUNTS) {
      // Check if admin already exists
      const existingAdmin = await User.findOne({ email: adminData.email });
      
      if (existingAdmin) {
        console.log(`⚠️  Admin already exists: ${adminData.email}`);
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(adminData.password, 10);

      // Create admin user
      await User.create({
        email: adminData.email,
        password: adminData.password,
        role: adminData.role
      });

      console.log(`✅ Admin created: ${adminData.email}`);
      console.log(`   Password: ${adminData.password}`);
      console.log(`   Role: ${adminData.role}\n`);
    }

    console.log('-----------------------------------');
    console.log('✅ Admin seeding completed!');
    console.log('-----------------------------------');
    console.log('⚠️  IMPORTANT: Change these passwords after first login!');
    console.log('-----------------------------------');

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();
