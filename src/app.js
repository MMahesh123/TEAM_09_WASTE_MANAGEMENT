
 // Main Application Entry Point - Waste Management System Backend
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import Routes
const authRoutes = require('./routes/authRoutes');
const { complaintRoutes } = require('./routes/complaintRoutes');
const { dashboardRoutes } = require('./routes/dashboardRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const wardRoutes = require('./routes/wardRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/wards', wardRoutes);

// Base route
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Waste Management System API is running successfully!'
    });
});

// Centralized Error Handling Middleware (after routes)
app.use(errorHandler);

module.exports = app;
