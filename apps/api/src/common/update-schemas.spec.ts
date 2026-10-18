import {
  updateBatchRequestSchema,
  updateBillingProfileRequestSchema,
  updateDiscountRequestSchema,
  updateInvoiceSettingsRequestSchema,
  updateLiveClassPresetRequestSchema,
  updatePayrollRuleSchema,
  updatePlanRequestSchema,
  updateUserRequestSchema
} from '@nexa-chess/types';

// Zod 4's `.partial()` re-applies create defaults, so an update naming one
// field used to reset every defaulted field it left out.
describe('update request schemas', () => {
  it.each([
    ['batch', updateBatchRequestSchema, { name: 'Renamed' }],
    ['user', updateUserRequestSchema, { firstName: 'Renamed' }],
    ['live-class preset', updateLiveClassPresetRequestSchema, { name: 'Renamed' }],
    ['invoice settings', updateInvoiceSettingsRequestSchema, { tradeName: 'Renamed' }],
    ['plan', updatePlanRequestSchema, { name: 'Renamed' }],
    ['discount', updateDiscountRequestSchema, { name: 'Renamed' }],
    ['payroll rule', updatePayrollRuleSchema, { name: 'Renamed' }],
    ['billing profile', updateBillingProfileRequestSchema, { phone: '12345' }]
  ])('%s: a one-field update parses to only that field', (_label, schema, input) => {
    expect(schema.parse(input)).toEqual(input);
  });

  it('still validates the fields that are sent', () => {
    expect(updatePlanRequestSchema.safeParse({ sortOrder: -1 }).success).toBe(false);
    expect(updateBillingProfileRequestSchema.safeParse({ country: 'IND' }).success).toBe(false);
  });

  it('keeps an explicit null on a nullable field', () => {
    expect(updateInvoiceSettingsRequestSchema.parse({ tradeName: null })).toEqual({ tradeName: null });
  });
});
