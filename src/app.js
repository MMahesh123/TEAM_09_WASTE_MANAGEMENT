// Main Application Entry Point - Waste Management System Backend
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import Routes
const authRoutes = require('./routes/authRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const wardRoutes = require('./routes/wardRoutes');
const disposalRoutes = require('./routes/disposalRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const complaintRoutes = require('./routes/complaintRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes mounting
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/wards', wardRoutes);
app.use('/api/disposal', disposalRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/complaints', complaintRoutes);

// Base route test
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Waste Management System API is running successfully!' });
});

const PORT = process.env.PORT || 5000;

// Only start listening when run directly, so tests can import the app without opening a port.
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;