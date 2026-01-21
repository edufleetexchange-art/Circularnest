import mongoose, { Document, Schema } from 'mongoose';

export interface ICircular extends Document {
  title: string;
  orderDate?: Date;
  description: string;
  category: string;
  fileId: mongoose.Types.ObjectId;
  fileName: string;
  fileSize: number;
  uploadedBy?: mongoose.Types.ObjectId; // Optional for guest uploads
  guestName?: string; // For guest uploads
  guestEmail?: string; // For guest uploads
  isPublished: boolean;
  isApprovedByAdmin: boolean; // Track if circular was approved by admin from user submission
  status: 'pending' | 'approved' | 'rejected'; // Status for filtering in admin dashboard
  createdAt: Date;
  updatedAt: Date;
}

const circularSchema = new Schema<ICircular>({
  title: {
    type: String,
    required: true,
    trim: true
  },
  orderDate: {
    type: Date
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    default: 'Education'
  },
  fileId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'uploads.files'
  },
  fileName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Allow guest uploads
    default: null // Explicitly set default to null for guest uploads
  },
  guestName: {
    type: String,
    trim: true
  },
  guestEmail: {
    type: String,
    trim: true
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  isApprovedByAdmin: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  }
}, {
  timestamps: true
});

// Index for faster queries
circularSchema.index({ category: 1, createdAt: -1 });
circularSchema.index({ uploadedBy: 1 });
circularSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<ICircular>('Circular', circularSchema);
