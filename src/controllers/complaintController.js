// Citizen Complaints Controller with Query Filtering and Status Update
exports.getComplaints = async (req, res) => {
    try {
        const { ward, status } = req.query;
        let complaints = [
            { id: 1, ward: 'Ward 12', type: 'Overflowing Bin', status: 'Pending' },
            { id: 2, ward: 'Ward 05', type: 'Missed Pickup', status: 'Resolved' },
            { id: 3, ward: 'Ward 12', type: 'Illegal Dumping', status: 'Pending' }
        ];

        if (ward) {
            complaints = complaints.filter(c => c.ward.toLowerCase() === ward.toLowerCase());
        }
        if (status) {
            complaints = complaints.filter(c => c.status.toLowerCase() === status.toLowerCase());
        }

        res.status(200).json({ success: true, count: complaints.length, data: complaints });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createComplaint = async (req, res) => {
    try {
        const { ward, type, description } = req.body;
        const newComplaint = { id: Date.now(), ward, type, description, status: 'Pending' };
        res.status(201).json({ success: true, message: 'Complaint registered successfully', data: newComplaint });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateComplaintStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: 'Status field is required.' });
        }

        res.status(200).json({
            success: true,
            message: `Complaint ${id} status updated to ${status}`,
            data: { id: Number(id), status }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};