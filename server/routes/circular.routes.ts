import express, { Response } from 'express';
import { protect, adminOnly, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import Circular from '../models/Circular';
import { uploadToGridFS, downloadFromGridFS, deleteFromGridFS } from '../utils/gridfsHelpers';
import mongoose from 'mongoose';

const router = express.Router();

// @route   POST /api/circulars/upload
// @desc    Upload a new circular (Admin only)
// @access  Private/Admin
router.post('/upload', protect, adminOnly, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { title, orderDate, description, category } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'Please upload a PDF file' });
    }

    if (!title || !description || !category) {
      return res.status(400).json({ message: 'Please provide title, description, and category' });
    }

    // Upload file to GridFS
    const fileId = await uploadToGridFS(file.buffer, file.originalname, file.mimetype);

    // Create circular document
    const circular = await Circular.create({
      title,
      orderDate: orderDate ? new Date(orderDate) : undefined,
      description,
      category,
      fileId,
      fileName: file.originalname,
      fileSize: file.size,
      uploadedBy: req.user._id,
      isPublished: true,
      status: 'approved' // Admin uploads are auto-approved
    });

    // Populate uploadedBy field
    await circular.populate('uploadedBy', 'email role');

    const circularObj = circular.toObject();
    const transformedCircular = {
      ...circularObj,
      id: circular._id.toString(),
      fileUrl: `/api/circulars/${circular._id}/download`
    };

    res.status(201).json({
      success: true,
      message: 'Circular uploaded successfully',
      circular: transformedCircular
    });
  } catch (error: any) {
    console.error('Upload circular error:', error);
    res.status(500).json({ message: 'Failed to upload circular', error: error.message });
  }
});

// @route   GET /api/circulars
// @desc    Get all circulars (Public - shows basic info only, filtered by status)
// @access  Public
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { category, limit = 100, page = 1, status } = req.query;

    console.log('[GET /api/circulars] Query params:', { category, limit, page, status });

    // Build the query object
    const query: any = {};
    
    // Always filter by isPublished status unless specifically requesting a particular status
    if (!status) {
      query.isPublished = true;
    }
    
    // Add category filter if provided
    if (category) {
      query.category = category;
    }
    
    // Add status filter
    if (status) {
      // For 'approved' status, include both explicitly approved and legacy documents without status field
      if (status === 'approved') {
        query.$or = [
          { status: 'approved' },
          { status: { $exists: false } }
        ];
        // Also ensure isPublished is true when filtering by status
        query.isPublished = true;
      } else {
        // For other statuses (pending, rejected), match exactly
        query.status = status;
        query.isPublished = true;
      }
    }

    console.log('[GET /api/circulars] Constructed query:', JSON.stringify(query));

    // Debug: Count total docs in collection
    const totalDocsInCollection = await Circular.countDocuments();
    console.log('[GET /api/circulars] Total documents in collection:', totalDocsInCollection);

    const circulars = await Circular.find(query)
      .populate('uploadedBy', 'email role')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Circular.countDocuments(query);

    console.log('[GET /api/circulars] Found circulars:', circulars.length, 'Total:', total);
    
    // Transform circulars to include fileUrl and normalize id field
    const transformedCirculars = circulars.map(circular => {
      const circularObj = circular.toObject();
      return {
        ...circularObj,
        id: circular._id.toString(), // Add id field for frontend
        fileUrl: `/api/circulars/${circular._id}/download`
      };
    });
    
    // Debug: Log sample circular if found
    if (transformedCirculars.length > 0) {
      console.log('[GET /api/circulars] Sample circular:', {
        id: transformedCirculars[0].id,
        title: transformedCirculars[0].title,
        status: transformedCirculars[0].status,
        isPublished: transformedCirculars[0].isPublished,
        fileUrl: transformedCirculars[0].fileUrl
      });
    }

    res.json({
      success: true,
      circulars: transformedCirculars,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error: any) {
    console.error('[GET /api/circulars] Error:', error);
    res.status(500).json({ message: 'Failed to fetch circulars', error: error.message });
  }
});

// @route   GET /api/circulars/:id/download
// @desc    Download circular PDF (Public - no auth required)
// @access  Public
// NOTE: This route must come BEFORE /:id route to avoid matching download as an ID
router.get('/:id/download', async (req: AuthRequest, res: Response) => {
  try {
    const circular = await Circular.findById(req.params.id);

    if (!circular) {
      return res.status(404).json({ message: 'Circular not found' });
    }

    // Download file from GridFS
    const fileBuffer = await downloadFromGridFS(circular.fileId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${circular.fileName}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    
    res.send(fileBuffer);
  } catch (error: any) {
    console.error('Download circular error:', error);
    res.status(500).json({ message: 'Failed to download circular', error: error.message });
  }
});

// @route   GET /api/circulars/:id
// @desc    Get single circular (Public - no auth required)
// @access  Public
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const circular = await Circular.findById(req.params.id).populate('uploadedBy', 'email role');

    if (!circular) {
      return res.status(404).json({ message: 'Circular not found' });
    }

    const circularObj = circular.toObject();
    const transformedCircular = {
      ...circularObj,
      id: circular._id.toString(),
      fileUrl: `/api/circulars/${circular._id}/download`
    };

    res.json({
      success: true,
      circular: transformedCircular
    });
  } catch (error: any) {
    console.error('Get circular error:', error);
    res.status(500).json({ message: 'Failed to fetch circular', error: error.message });
  }
});

// @route   PUT /api/circulars/:id/status
// @desc    Update circular status (Admin only)
// @access  Private/Admin
router.put('/:id/status', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;

    if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be pending, approved, or rejected' });
    }

    const circular = await Circular.findById(req.params.id);

    if (!circular) {
      return res.status(404).json({ message: 'Circular not found' });
    }

    circular.status = status;
    await circular.save();

    const circularObj = circular.toObject();
    const transformedCircular = {
      ...circularObj,
      id: circular._id.toString(),
      fileUrl: `/api/circulars/${circular._id}/download`
    };

    res.json({
      success: true,
      message: 'Circular status updated successfully',
      circular: transformedCircular
    });
  } catch (error: any) {
    console.error('Update circular status error:', error);
    res.status(500).json({ message: 'Failed to update circular status', error: error.message });
  }
});

// @route   PUT /api/circulars/:id
// @desc    Update circular (Admin only)
// @access  Private/Admin
router.put('/:id', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { title, orderDate, description, category, isPublished, status } = req.body;

    const circular = await Circular.findById(req.params.id);

    if (!circular) {
      return res.status(404).json({ message: 'Circular not found' });
    }

    // Update fields
    if (title) circular.title = title;
    if (orderDate !== undefined) circular.orderDate = orderDate ? new Date(orderDate) : undefined;
    if (description) circular.description = description;
    if (category) circular.category = category;
    if (isPublished !== undefined) circular.isPublished = isPublished;
    if (status) circular.status = status;

    await circular.save();

    const circularObj = circular.toObject();
    const transformedCircular = {
      ...circularObj,
      id: circular._id.toString(),
      fileUrl: `/api/circulars/${circular._id}/download`
    };

    res.json({
      success: true,
      message: 'Circular updated successfully',
      circular: transformedCircular
    });
  } catch (error: any) {
    console.error('Update circular error:', error);
    res.status(500).json({ message: 'Failed to update circular', error: error.message });
  }
});

// @route   DELETE /api/circulars/:id
// @desc    Delete circular (Admin only)
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const circular = await Circular.findById(req.params.id);

    if (!circular) {
      return res.status(404).json({ message: 'Circular not found' });
    }

    // Delete file from GridFS
    await deleteFromGridFS(circular.fileId);

    // Delete circular document
    await circular.deleteOne();

    res.json({
      success: true,
      message: 'Circular deleted successfully'
    });
  } catch (error: any) {
    console.error('Delete circular error:', error);
    res.status(500).json({ message: 'Failed to delete circular', error: error.message });
  }
});

export default router;
