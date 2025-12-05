const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Database setup
const dbPath = path.join(__dirname, 'database', 'database.db');

// Ensure database directory exists
if (!fs.existsSync(path.join(__dirname, 'database'))) {
    fs.mkdirSync(path.join(__dirname, 'database'), { recursive: true });
}

// Connect to SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error connecting to database:', err.message);
        process.exit(1);
    } else {
        console.log('✅ Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            age INTEGER,
            gender TEXT,
            bio TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.run(createTableSQL, (err) => {
        if (err) {
            console.error('❌ Error creating table:', err.message);
        } else {
            console.log('✅ Users table ready');
            
            // Insert sample data if table is empty
            db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
                if (err) {
                    console.error('Error checking table:', err);
                    return;
                }
                
                if (row.count === 0) {
                    insertSampleData();
                }
            });
        }
    });
}

// Insert sample data
function insertSampleData() {
    const sampleUsers = [
        ['John Doe', 'john@example.com', 25, 'Male', 'Software Developer from New York'],
        ['Jane Smith', 'jane@example.com', 30, 'Female', 'Data Scientist passionate about AI'],
        ['Bob Wilson', 'bob@example.com', null, 'Male', null],
        ['Alice Johnson', 'alice@example.com', 28, 'Female', 'Loves hiking and photography']
    ];
    
    const insertSQL = `INSERT INTO users (name, email, age, gender, bio) VALUES (?, ?, ?, ?, ?)`;
    
    sampleUsers.forEach(user => {
        db.run(insertSQL, user, function(err) {
            if (err) {
                console.error('Error inserting sample data:', err.message);
            }
        });
    });
    
    console.log('✅ Sample data inserted');
}

// API Routes

// Get all users
app.get('/api/users', (req, res) => {
    const sql = `SELECT * FROM users ORDER BY created_at DESC`;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to fetch users' });
        }
        res.json(rows);
    });
});

// Get single user by ID
app.get('/api/users/:id', (req, res) => {
    const sql = `SELECT * FROM users WHERE id = ?`;
    
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to fetch user' });
        }
        
        if (!row) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(row);
    });
});

// Create new user
app.post('/api/users', (req, res) => {
    const { name, email, age, gender, bio } = req.body;
    
    // Validation
    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
    }
    
    if (!validateEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    
    const sql = `INSERT INTO users (name, email, age, gender, bio) VALUES (?, ?, ?, ?, ?)`;
    
    db.run(sql, [name, email, age, gender, bio], function(err) {
        if (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
                return res.status(400).json({ error: 'Email already exists' });
            }
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to create user' });
        }
        
        res.status(201).json({ 
            id: this.lastID, 
            message: 'User created successfully',
            name, 
            email 
        });
    });
});

// Update user
app.put('/api/users/:id', (req, res) => {
    const { name, email, age, gender, bio } = req.body;
    const userId = req.params.id;
    
    const sql = `
        UPDATE users 
        SET name = ?, email = ?, age = ?, gender = ?, bio = ? 
        WHERE id = ?
    `;
    
    db.run(sql, [name, email, age, gender, bio, userId], function(err) {
        if (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
                return res.status(400).json({ error: 'Email already exists' });
            }
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to update user' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ 
            id: userId,
            message: 'User updated successfully'
        });
    });
});

// Delete user
app.delete('/api/users/:id', (req, res) => {
    const sql = `DELETE FROM users WHERE id = ?`;
    
    db.run(sql, [req.params.id], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to delete user' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ 
            message: 'User deleted successfully' 
        });
    });
});

// Search users
app.get('/api/users/search/:query', (req, res) => {
    const query = `%${req.params.query}%`;
    const sql = `
        SELECT * FROM users 
        WHERE name LIKE ? OR email LIKE ? OR bio LIKE ?
        ORDER BY created_at DESC
    `;
    
    db.all(sql, [query, query, query], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Search failed' });
        }
        res.json(rows);
    });
});

// Get statistics
app.get('/api/stats', (req, res) => {
    const stats = {};
    
    // Get total users
    db.get('SELECT COUNT(*) as total FROM users', (err, row) => {
        if (err) return handleError(res, err);
        stats.totalUsers = row.total;
        
        // Get average age
        db.get('SELECT AVG(age) as avgAge FROM users WHERE age IS NOT NULL', (err, row) => {
            if (err) return handleError(res, err);
            stats.averageAge = Math.round(row.avgAge || 0);
            
            // Get gender distribution
            db.all('SELECT gender, COUNT(*) as count FROM users GROUP BY gender', (err, rows) => {
                if (err) return handleError(res, err);
                stats.genderDistribution = rows;
                
                res.json(stats);
            });
        });
    });
});

// Helper function for error handling
function handleError(res, err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
}

// Email validation function
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('✅ Database connection closed');
        }
        process.exit(0);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📊 Visit: http://localhost:${PORT}/api/users to see all users`);
    console.log(`📝 Use POST to http://localhost:${PORT}/api/users to add new users`);
});