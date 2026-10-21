const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const { complaintRoutes } = require('./routes/complaintRoutes');
const { dashboardRoutes } = require('./routes/dashboardRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/', (req, res) => {
    res.status(200).json({ message: 'WMS API Running' });
});

// Centralized Error Handling Middleware (must be registered after routes)
app.use(errorHandler);

module.exports = app;