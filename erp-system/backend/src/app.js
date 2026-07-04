require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./modules/auth/auth.routes');
const projectRoutes = require('./modules/project/project.routes');
const boqRoutes = require('./modules/boq/boq.routes');
const procurementRoutes = require('./modules/procurement/procurement.routes');
const warehouseRoutes = require('./modules/warehouse/warehouse.routes');
const executionRoutes = require('./modules/execution/execution.routes');
const financeRoutes = require('./modules/finance/finance.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const auditRoutes = require('./modules/audit/audit.routes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/boq', boqRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api/execution', executionRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

module.exports = app;
