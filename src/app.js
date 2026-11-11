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
const disposalRoutes = require('./routes/disposalRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
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
app.use('/api/disposal', disposalRoutes);
app.use('/api/payments', paymentRoutes);

// Base route
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Waste Management System API is running successfully!'
    });
});

// Centralized Error Handling Middleware (after routes)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Only start listening if not running inside a test environment
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;
