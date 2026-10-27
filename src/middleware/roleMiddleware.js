const verifyRole = (allowedRoles) => {
    return (req, res, next) => {
        // Assuming req.user is populated by your authentication middleware (e.g., JWT verify)
        const userRole = req.user && req.user.role; 

        if (!userRole) {
            return res.status(401).json({ error: "Access denied. No role provided or unauthorized." });
        }

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({ 
                error: `Access forbidden. Requires one of the following roles: ${allowedRoles.join(', ')}` 
            });
        }

        next();
    };
};

module.exports = verifyRole;