const { z } = require('zod');
const partyRouter = require('./partyRouter');
const { optText } = require('../utils/schemas');

module.exports = partyRouter({
  table: 'customers',
  entity: 'customer',
  label: 'Müşteri',
  fk: 'customer_id',
  orderBy: 'full_name',
  fields: {
    full_name: z.string().trim().min(2).max(120),
    phone: optText(30),
    email: z.string().trim().email().optional().nullable().or(z.literal('').transform(() => null)),
    national_id: z.string().trim().regex(/^\d{11}$/, 'T.C. kimlik no 11 haneli olmalı').optional().nullable().or(z.literal('').transform(() => null)),
    address: optText(300),
    notes: optText(500),
  },
  searchCols: ['full_name', 'phone', 'email', 'national_id'],
  managePerm: 'customer.manage',
  readPerms: ['sale.create', 'trade.create', 'purchase.create', 'stock.edit', 'report.view'],
});
