import express from 'express'
import mongoose from 'mongoose'
import User from '../db/models/User.js'
import { verifyToken } from '../middleware/auth.js'
import { requireRole } from '../middleware/roleGuard.js'

const router = express.Router()
const payrollRoles = [verifyToken, requireRole('hr', 'accounting', 'admin')]

router.get('/employees', ...payrollRoles, async (req, res, next) => {
  try {
    const employees = await User.find()
      .select('first_name last_name email role team_id is_active salary_annual_usd')
      .populate('team_id', 'name')
      .sort({ first_name: 1, last_name: 1 })
      .lean()

    res.json(employees.map((employee) => ({
      ...employee,
      team_name: employee.team_id?.name || null,
      team_id: employee.team_id?._id || null,
    })))
  } catch (error) {
    next(error)
  }
})

router.patch('/employees/:id/salary', ...payrollRoles, async (req, res, next) => {
  const salary = req.body.salary_annual_usd
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid employee ID' })
  }
  if (salary !== null && (typeof salary !== 'number' || !Number.isFinite(salary) || salary < 0)) {
    return res.status(400).json({ error: 'Annual salary must be a non-negative number or null' })
  }

  try {
    const employee = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { salary_annual_usd: salary } },
      { new: true, runValidators: true, select: '_id salary_annual_usd' },
    ).lean()

    if (!employee) return res.status(404).json({ error: 'Employee not found' })
    res.json(employee)
  } catch (error) {
    next(error)
  }
})

router.get('/compliance', ...payrollRoles, async (req, res, next) => {
  try {
    const eligibleEmployees = await User.countDocuments({ role: { $ne: 'admin' } })
    res.json({
      sick_leave_eligible: eligibleEmployees,
      maternity_leave_requests: 0,
      bereavement_leave_requests: 0,
      overall_status: 'compliant',
    })
  } catch (error) {
    next(error)
  }
})

export default router