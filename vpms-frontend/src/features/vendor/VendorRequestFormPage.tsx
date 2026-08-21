import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { ApiError, friendlyMessage } from '@/lib/api-client'
import { ROUTES } from '@/lib/nav-config'
import { useCreateVendorRequest } from '@/features/vendor/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'

const CATEGORIES = [
  'Professional Services',
  'IT / Software',
  'Facilities & Maintenance',
  'Office Supplies',
  'Catering',
  'Logistics & Transportation',
  'Marketing & Advertising',
  'Consulting',
  'Other',
]

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/

const schema = z
  .object({
    business_need: z.string().min(1, 'Business need is required'),
    category: z.string().min(1, 'Category is required'),
    estimated_annual_spend: z.coerce.number({ invalid_type_error: 'Enter a number' }).min(0, 'Must be 0 or more'),
    recommended_vendor_name: z.string().min(1, 'Vendor name is required'),
    recommended_pan: z
      .string()
      .transform((v) => v.trim().toUpperCase())
      .refine((v) => PAN_PATTERN.test(v), 'Invalid PAN format, expected e.g. ABCDE1234F'),
    recommended_gstin: z
      .string()
      .transform((v) => v.trim().toUpperCase())
      .refine((v) => v === '' || GSTIN_PATTERN.test(v), 'Invalid GSTIN format')
      .optional()
      .or(z.literal('')),
    financial_stability_ok: z.boolean().refine((v) => v, 'Required'),
    technical_capability_ok: z.boolean().refine((v) => v, 'Required'),
    compliance_status_ok: z.boolean().refine((v) => v, 'Required'),
    blacklist_check_ok: z.boolean().refine((v) => v, 'Required'),
    conflict_of_interest_declared: z.boolean().refine((v) => v, 'Required'),
    references_provided: z.boolean(),
    is_msme: z.boolean(),
    msme_udyam_number: z.string().optional(),
  })
  .refine((data) => !data.is_msme || (data.msme_udyam_number?.trim().length ?? 0) > 0, {
    message: 'MSME/Udyam number is required when MSME status is claimed',
    path: ['msme_udyam_number'],
  })

type FormValues = z.infer<typeof schema>

const CHECKLIST_ITEMS = [
  ['financial_stability_ok', 'Financial stability confirmed'],
  ['technical_capability_ok', 'Technical capability confirmed'],
  ['compliance_status_ok', 'Compliance status confirmed'],
  ['blacklist_check_ok', 'Blacklist check passed'],
  ['conflict_of_interest_declared', 'Conflict of interest declared'],
  ['references_provided', 'References provided (recommended, not mandatory)'],
] as const

/** Phase 1 UI's vendor request intake form. Mirrors vendor-request-form.html +
 * vendor-request-form.js field-for-field, including the 400/409 duplicate-PAN error
 * being surfaced on the recommended_pan field specifically. */
export function VendorRequestFormPage() {
  const navigate = useNavigate()
  const createRequest = useCreateVendorRequest()

  const {
    register,
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      business_need: '',
      category: '',
      recommended_vendor_name: '',
      recommended_pan: '',
      recommended_gstin: '',
      msme_udyam_number: '',
      references_provided: false,
      is_msme: false,
      financial_stability_ok: false,
      technical_capability_ok: false,
      compliance_status_ok: false,
      blacklist_check_ok: false,
      conflict_of_interest_declared: false,
    },
  })

  const isMsme = watch('is_msme')

  async function onSubmit(values: FormValues) {
    try {
      await createRequest.mutateAsync({
        business_need: values.business_need,
        category: values.category,
        estimated_annual_spend: String(values.estimated_annual_spend),
        recommended_vendor_name: values.recommended_vendor_name,
        recommended_pan: values.recommended_pan,
        recommended_gstin: values.recommended_gstin || null,
        financial_stability_ok: values.financial_stability_ok,
        technical_capability_ok: values.technical_capability_ok,
        compliance_status_ok: values.compliance_status_ok,
        blacklist_check_ok: values.blacklist_check_ok,
        conflict_of_interest_declared: values.conflict_of_interest_declared,
        references_provided: values.references_provided,
        msme_udyam_number: values.is_msme ? values.msme_udyam_number?.trim() || null : null,
      })
      toast.success('Vendor request submitted.')
      navigate(ROUTES.vendorRequestsList)
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 409)) {
        // Section 5.2 duplicate-PAN/GSTIN check: surface right next to the PAN field.
        setError('recommended_pan', { message: err.message })
      } else {
        setError('root', { message: friendlyMessage(err) })
      }
    }
  }

  return (
    <Card>
      <CardContent className="pt-space-3">
        <h1 className="mb-space-2 font-heading text-size-1 font-bold">New Vendor Request</h1>

        {errors.root && (
          <div className="mb-space-2 rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
            {errors.root.message}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Label htmlFor="business_need">Business Need</Label>
          <Textarea id="business_need" {...register('business_need')} />
          {errors.business_need && <p className="mt-1 text-size-5 text-destructive">{errors.business_need.message}</p>}

          <Label htmlFor="category">Category</Label>
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category…" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.category && <p className="mt-1 text-size-5 text-destructive">{errors.category.message}</p>}

          <Label htmlFor="estimated_annual_spend">Estimated Annual Spend (INR)</Label>
          <Input id="estimated_annual_spend" type="number" min={0} step="0.01" {...register('estimated_annual_spend')} />
          {errors.estimated_annual_spend && (
            <p className="mt-1 text-size-5 text-destructive">{errors.estimated_annual_spend.message}</p>
          )}

          <Label htmlFor="recommended_vendor_name">Recommended Vendor Name</Label>
          <Input id="recommended_vendor_name" {...register('recommended_vendor_name')} />
          {errors.recommended_vendor_name && (
            <p className="mt-1 text-size-5 text-destructive">{errors.recommended_vendor_name.message}</p>
          )}

          <Label htmlFor="recommended_pan">Recommended Vendor PAN</Label>
          <Input id="recommended_pan" placeholder="ABCDE1234F" maxLength={10} {...register('recommended_pan')} />
          {errors.recommended_pan && <p className="mt-1 text-size-5 text-destructive">{errors.recommended_pan.message}</p>}

          <Label htmlFor="recommended_gstin">Recommended Vendor GSTIN (optional)</Label>
          <Input id="recommended_gstin" placeholder="27ABCDE1234F1Z5" maxLength={15} {...register('recommended_gstin')} />
          {errors.recommended_gstin && (
            <p className="mt-1 text-size-5 text-destructive">{errors.recommended_gstin.message}</p>
          )}

          <h2 className="mt-space-4 font-heading text-size-2 font-bold">Evaluation Checklist</h2>

          {CHECKLIST_ITEMS.map(([field, label]) => (
            <div key={field} className="mt-space-2 flex items-center gap-space-1">
              <Controller
                name={field}
                control={control}
                render={({ field: f }) => (
                  <Checkbox id={field} checked={f.value} onCheckedChange={f.onChange} />
                )}
              />
              <Label htmlFor={field} className="mb-0 mt-0 font-normal">
                {label}
              </Label>
            </div>
          ))}
          {(errors.financial_stability_ok ||
            errors.technical_capability_ok ||
            errors.compliance_status_ok ||
            errors.blacklist_check_ok ||
            errors.conflict_of_interest_declared) && (
            <p className="mt-1 text-size-5 text-destructive">All checklist items except references are required.</p>
          )}

          <div className="mt-space-3 flex items-center gap-space-1">
            <Controller
              name="is_msme"
              control={control}
              render={({ field }) => <Checkbox id="is_msme" checked={field.value} onCheckedChange={field.onChange} />}
            />
            <Label htmlFor="is_msme" className="mb-0 mt-0 font-normal">
              Vendor claims MSME status?
            </Label>
          </div>

          <Label htmlFor="msme_udyam_number">MSME / Udyam Number</Label>
          <Input id="msme_udyam_number" disabled={!isMsme} {...register('msme_udyam_number')} />
          {errors.msme_udyam_number && (
            <p className="mt-1 text-size-5 text-destructive">{errors.msme_udyam_number.message}</p>
          )}

          <Button type="submit" className="mt-space-3" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit Request'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
