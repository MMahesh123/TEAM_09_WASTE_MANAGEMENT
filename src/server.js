const app = require('./app');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const { dashboardRoutes } = require('./routes/dashboardRoutes');
const { complaintRoutes } = require('./routes/complaintRoutes');

// Mount routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/complaints', complaintRoutes);