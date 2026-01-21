import mongoose, { Document, Schema } from 'mongoose';

export interface IPendingUpload extends Document {
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
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: mongoose.Types.ObjectId;
  reviewNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const pendingUploadSchema = new Schema<IPendingUpload>({
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
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewNotes: String
}, {
  timestamps: true
});

pendingUploadSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IPendingUpload>('PendingUpload', pendingUploadSchema);
