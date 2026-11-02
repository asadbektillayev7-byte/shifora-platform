import { Router } from 'express';
import { all, get, insert, run, transaction } from '../db/index.js';
import { audit } from '../lib/audit.js';
import { wrap } from '../lib/http.js';
import { createMedicationCatalogue } from '../lib/medicationCatalogue.js';
import { requireAuth, requireHospitalStaff } from '../middleware/auth.js';

const router = Router();
const catalogue = createMedicationCatalogue({ all, get, insert, run });

router.use(requireAuth, requireHospitalStaff);

// Active catalogue entries by default. Staff can recover disabled items using
// ?include_inactive=true or inspect only disabled entries using ?is_active=0.
router.get('/', wrap(async (req, res) => {
  res.json({ medications: await catalogue.list(req.user.hospital_id, req.query) });
}));

router.get('/:id', wrap(async (req, res) => {
  res.json({ medication: await catalogue.find(req.user.hospital_id, req.params.id) });
}));

router.post('/', wrap(async (req, res) => {
  const medication = await transaction(async () => {
    const created = await catalogue.create(req.user.hospital_id, req.user.id, req.body);
    await audit(req, 'medication_catalog.create', 'medication_catalog', created.id, {
      fields: Object.keys(req.body), is_active: created.is_active,
    });
    return created;
  });
  res.status(201).json({ medication });
}));

router.patch('/:id', wrap(async (req, res) => {
  const medication = await transaction(async () => {
    const updated = await catalogue.update(req.user.hospital_id, req.user.id, req.params.id, req.body);
    await audit(req, 'medication_catalog.update', 'medication_catalog', updated.id, {
      fields: Object.keys(req.body), is_active: updated.is_active,
    });
    return updated;
  });
  res.json({ medication });
}));

export default router;
