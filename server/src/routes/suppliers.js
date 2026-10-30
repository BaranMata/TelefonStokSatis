const { z } = require('zod');
const partyRouter = require('./partyRouter');
const { optText } = require('../utils/schemas');

module.exports = partyRouter({
  table: 'suppliers',
  entity: 'supplier',
  label: 'Tedarikçi',
  fk: 'supplier_id',
  orderBy: 'name',
  fields: {
    name: z.string().trim().min(2).max(120),
    contact_name: optText(120),
    phone: optText(30),
    email: z.string().trim().email().optional().nullable().or(z.literal('').transform(() => null)),
    tax_no: optText(20),
    address: optText(300),
    notes: optText(500),
  },
  searchCols: ['name', 'contact_name', 'phone', 'tax_no'],
  managePerm: 'supplier.manage',
  readPerms: ['purchase.create', 'report.view'],
});
