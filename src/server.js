const app = require('./app');
require('dotenv').config();

const { dashboardRoutes } = require('./routes/dashboardRoutes');
const { complaintRoutes } = require('./routes/complaintRoutes');
const errorHandler = require('./middleware/errorHandler');

// Mount routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/complaints', complaintRoutes);

// Centralized error handler (must be after routes)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});