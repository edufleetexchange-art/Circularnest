import express, { Response } from 'express';
import { protect, adminOnly, optionalAuth, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import PendingUpload, { IPendingUpload } from '../models/PendingUpload';
import Circular from '../models/Circular';
import { uploadToGridFS, deleteFromGridFS, downloadFromGridFS } from '../utils/gridfsHelpers';

const router = express.Router();

// @route   POST /api/pending/guest-upload
// @desc    Submit circular for review (Guest - No Login Required)
// @access  Public
router.post('/guest-upload', upload.single('file'), async (req: express.Request, res: Response) => {
  let uploadedFileId: any = null;
  
  try {
    console.log('POST /api/pending/guest-upload - Processing guest upload');
    
    const { title, orderDate, description, category, guestName, guestEmail } = req.body;
    const file = req.file;

    if (!file) {
      console.log('Guest upload error: No file provided');
      return res.status(400).json({ message: 'Please upload a PDF file' });
    }

    if (!title || !description || !category) {
      console.log('Guest upload error: Missing required fields', { title: !!title, description: !!description, category: !!category });
      return res.status(400).json({ message: 'Please provide title, description, and category' });
    }

    // Validate guest email format if provided (only if not empty)
    const cleanGuestEmail = guestEmail?.trim() || '';
    if (cleanGuestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanGuestEmail)) {
      console.log('Guest upload error: Invalid email format', cleanGuestEmail);
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Upload file to GridFS
    console.log('Uploading to GridFS:', file.originalname, file.size, 'bytes');
    try {
      uploadedFileId = await uploadToGridFS(file.buffer, file.originalname, file.mimetype);
      console.log('GridFS upload successful, fileId:', uploadedFileId);
    } catch (gridfsError: any) {
      console.error('GridFS upload failed:', gridfsError.message);
      return res.status(500).json({ 
        message: 'Failed to upload file to storage', 
        error: gridfsError.message 
      });
    }

    // Create pending upload document for guest
    const uploadData: any = {
      title: title.trim(),
      orderDate: orderDate ? new Date(orderDate) : undefined,
      description: description.trim(),
      category: category.trim(),
      fileId: uploadedFileId,
      fileName: file.originalname,
      fileSize: file.size,
      guestName: guestName?.trim() || 'Anonymous',
      status: 'pending'
    };

    // Only include email if provided
    if (cleanGuestEmail) {
      uploadData.guestEmail = cleanGuestEmail;
    }

    const pendingUpload = await PendingUpload.create(uploadData);
    console.log('Guest PendingUpload created successfully:', pendingUpload._id);

    res.status(201).json({
      success: true,
      message: 'Circular submitted for admin review. Thank you!',
      pendingUpload
    });
  } catch (error: any) {
    console.error('Guest upload error:', error);
    console.error('Error stack:', error.stack);
    
    // If file was uploaded but database save failed, log the fileId for cleanup
    if (uploadedFileId) {
      console.error('Uploaded file exists but database save failed. File ID for cleanup:', uploadedFileId);
    }
    
    // Provide more specific error messages
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation error: ' + error.message });
    }
    if (error.name === 'MongoServerError' && error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate entry detected' });
    }
    
    res.status(500).json({ 
      message: 'Failed to submit circular', 
      error: error.message 
    });
  }
});

// @route   POST /api/pending/upload
// @desc    Submit circular for review (Logged-in User or Guest)
// @access  Public (Optional auth - if authenticated, links to user; if not, treated as guest)
router.post('/upload', optionalAuth, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    console.log('POST /api/pending/upload - User authenticated:', !!req.user);
    
    const { title, orderDate, description, category, guestName, guestEmail } = req.body;
    const file = req.file;

    // Validate file
    if (!file) {
      console.log('Upload error: No file provided');
      return res.status(400).json({ message: 'Please upload a PDF file' });
    }

    // Validate required fields
    if (!title || !description || !category) {
      console.log('Upload error: Missing required fields', { title: !!title, description: !!description, category: !!category });
      return res.status(400).json({ message: 'Please provide title, description, and category' });
    }

    // Validate guest email format if provided (only if not empty)
    const cleanGuestEmail = guestEmail?.trim() || '';
    if (cleanGuestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanGuestEmail)) {
      console.log('Upload error: Invalid email format', cleanGuestEmail);
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Upload file to GridFS
    let fileId;
    try {
      console.log('Uploading to GridFS:', file.originalname, file.size, 'bytes');
      fileId = await uploadToGridFS(file.buffer, file.originalname, file.mimetype);
      console.log('GridFS upload successful, fileId:', fileId);
    } catch (gridfsError: any) {
      console.error('GridFS upload error:', gridfsError);
      return res.status(500).json({ message: 'Failed to upload file to storage', error: gridfsError.message });
    }

    // Create pending upload document - handles both authenticated and guest uploads
    const uploadData: any = {
      title: title.trim(),
      orderDate: orderDate ? new Date(orderDate) : undefined,
      description: description.trim(),
      category: category.trim(),
      fileId,
      fileName: file.originalname,
      fileSize: file.size,
      status: 'pending'
    };

    // If user is authenticated, link to user; otherwise treat as guest
    if (req.user) {
      uploadData.uploadedBy = req.user._id;
      console.log('Creating upload for authenticated user:', req.user._id);
    } else {
      // Guest upload - only include guest fields if they have values
      uploadData.guestName = guestName?.trim() || 'Anonymous';
      if (cleanGuestEmail) {
        uploadData.guestEmail = cleanGuestEmail;
      }
      console.log('Creating guest upload with name:', uploadData.guestName);
    }

    const pendingUpload = await PendingUpload.create(uploadData);
    console.log('PendingUpload created successfully:', pendingUpload._id);

    // Populate uploadedBy if present
    if (req.user) {
      await pendingUpload.populate('uploadedBy', 'email institutionName');
    }

    res.status(201).json({
      success: true,
      message: req.user ? 'Circular submitted for review' : 'Circular submitted for admin review. Thank you!',
      pendingUpload
    });
  } catch (error: any) {
    console.error('Submit pending upload error:', error);
    console.error('Error stack:', error.stack);
    
    // Provide more specific error messages
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation error', error: error.message });
    }
    if (error.name === 'MongoServerError' && error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate entry detected', error: error.message });
    }
    
    res.status(500).json({ message: 'Failed to submit circular', error: error.message });
  }
});

// @route   GET /api/pending
// @desc    Get all pending uploads (Admin only)
// @access  Private/Admin
router.get('/', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { status, limit = 100 } = req.query;

    const query: any = {};
    if (status) {
      query.status = status;
    }

    const pendingUploads = await PendingUpload.find(query)
      .populate('uploadedBy', 'email institutionName')
      .populate('reviewedBy', 'email')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json({
      success: true,
      pendingUploads
    });
  } catch (error: any) {
    console.error('Get pending uploads error:', error);
    res.status(500).json({ message: 'Failed to fetch pending uploads', error: error.message });
  }
});

// @route   GET /api/pending/my-submissions
// @desc    Get user's submitted circulars (both pending and approved/rejected)
// @access  Private
router.get('/my-submissions', protect, async (req: AuthRequest, res: Response) => {
  try {
    // Get pending uploads
    const pendingUploads = await PendingUpload.find({ uploadedBy: req.user._id })
      .populate('reviewedBy', 'email')
      .sort({ createdAt: -1 });

    // Get approved/rejected circulars submitted by this user
    const approvedCirculars = await Circular.find({
      uploadedBy: req.user._id,
      status: { $in: ['approved', 'rejected'] }
    })
      .populate('uploadedBy', 'email institutionName')
      .sort({ createdAt: -1 });

    // Combine and sort by creation date
    const allSubmissions = [
      ...pendingUploads,
      ...approvedCirculars
    ].sort((a: any, b: any) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA; // Most recent first
    });

    res.json({
      success: true,
      pendingUploads: allSubmissions // Return as pendingUploads for backward compatibility
    });
  } catch (error: any) {
    console.error('Get my submissions error:', error);
    res.status(500).json({ message: 'Failed to fetch submissions', error: error.message });
  }
});

// @route   GET /api/pending/:id/file
// @desc    Download/preview pending upload file (Admin only)
// @access  Private/Admin
// NOTE: This route must come BEFORE /:id routes to avoid matching as an ID
router.get('/:id/file', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const pendingUpload = await PendingUpload.findById(req.params.id);

    if (!pendingUpload) {
      return res.status(404).json({ message: 'Pending upload not found' });
    }

    // Download file from GridFS
    const fileBuffer = await downloadFromGridFS(pendingUpload.fileId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pendingUpload.fileName}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    res.send(fileBuffer);
  } catch (error: any) {
    console.error('Download pending file error:', error);
    res.status(500).json({ message: 'Failed to download file', error: error.message });
  }
});

// @route   PUT /api/pending/:id/approve
// @desc    Approve pending upload (Admin only)
// @access  Private/Admin
router.put('/:id/approve', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const pendingUpload = await PendingUpload.findById(req.params.id);

    if (!pendingUpload) {
      return res.status(404).json({ message: 'Pending upload not found' });
    }

    if (pendingUpload.status !== 'pending') {
      return res.status(400).json({ message: 'This upload has already been reviewed' });
    }

    // Create circular from pending upload
    const circular = await Circular.create({
      title: pendingUpload.title,
      orderDate: pendingUpload.orderDate,
      description: pendingUpload.description,
      category: pendingUpload.category,
      fileId: pendingUpload.fileId,
      fileName: pendingUpload.fileName,
      fileSize: pendingUpload.fileSize,
      uploadedBy: pendingUpload.uploadedBy, // Will be undefined for guest uploads
      guestName: pendingUpload.guestName, // Transfer guest info
      guestEmail: pendingUpload.guestEmail, // Transfer guest info
      isPublished: true,
      isApprovedByAdmin: true, // Mark as approved by admin
      status: 'approved' // Set initial status to approved
    });

    // DELETE the pending upload record after approval (move to circulars collection)
    await pendingUpload.deleteOne();

    res.json({
      success: true,
      message: 'Circular approved and published',
      circular
    });
  } catch (error: any) {
    console.error('Approve upload error:', error);
    res.status(500).json({ message: 'Failed to approve circular', error: error.message });
  }
});

// @route   PUT /api/pending/:id/reject
// @desc    Reject pending upload (Admin only)
// @access  Private/Admin
router.put('/:id/reject', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { reviewNotes } = req.body;
    const pendingUpload = await PendingUpload.findById(req.params.id);

    if (!pendingUpload) {
      return res.status(404).json({ message: 'Pending upload not found' });
    }

    if (pendingUpload.status !== 'pending') {
      return res.status(400).json({ message: 'This upload has already been reviewed' });
    }

    // Create a rejected circular record for admin dashboard visibility
    // Store file for potential review/appeals
    const rejectedCircular = await Circular.create({
      title: pendingUpload.title,
      orderDate: pendingUpload.orderDate,
      description: pendingUpload.description,
      category: pendingUpload.category,
      fileId: pendingUpload.fileId,
      fileName: pendingUpload.fileName,
      fileSize: pendingUpload.fileSize,
      uploadedBy: pendingUpload.uploadedBy, // Will be undefined for guest uploads
      guestName: pendingUpload.guestName, // Transfer guest info
      guestEmail: pendingUpload.guestEmail, // Transfer guest info
      isPublished: false, // Not published
      isApprovedByAdmin: false,
      status: 'rejected', // Mark as rejected
      reviewNotes: reviewNotes // Store admin's rejection reason
    });

    // DELETE the pending upload record after rejection (move to circulars collection)
    await pendingUpload.deleteOne();

    res.json({
      success: true,
      message: 'Circular rejected',
      rejectedCircular
    });
  } catch (error: any) {
    console.error('Reject upload error:', error);
    res.status(500).json({ message: 'Failed to reject circular', error: error.message });
  }
});

// @route   DELETE /api/pending/:id
// @desc    Delete pending upload (User can only delete their own pending submissions)
// @access  Private
router.delete('/:id', protect, async (req: AuthRequest, res: Response) => {
  try {
    const pendingUpload = await PendingUpload.findById(req.params.id);

    if (!pendingUpload) {
      return res.status(404).json({ message: 'Pending upload not found' });
    }

    // Check if user owns this submission (unless admin)
    // If uploadedBy is undefined (guest upload), non-admin users should not be allowed to delete it.
    if (req.user.role !== 'admin' && (!pendingUpload.uploadedBy || pendingUpload.uploadedBy.toString() !== req.user._id.toString())) {
      return res.status(403).json({ message: 'Not authorized to delete this submission' });
    }

    // Prevent deletion of approved circulars (only admins can delete from Circular collection)
    if (pendingUpload.status === 'approved') {
      return res.status(403).json({ 
        message: 'Cannot delete approved circulars. This circular has been approved and published. Only administrators can manage published circulars.' 
      });
    }

    // Delete file from GridFS
    await deleteFromGridFS(pendingUpload.fileId);

    // Delete pending upload document
    await pendingUpload.deleteOne();

    res.json({
      success: true,
      message: 'Submission deleted successfully'
    });
  } catch (error: any) {
    console.error('Delete pending upload error:', error);
    res.status(500).json({ message: 'Failed to delete submission', error: error.message });
  }
});

export default router;
