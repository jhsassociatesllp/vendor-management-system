import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Controller } from 'react-hook-form'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import type { User } from '@/lib/types'
import {
  useAllUsers,
  useAssignableRoles,
  useCreateUser,
  useResetPassword,
  useUpdateUser,
} from '@/features/admin/hooks'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DataTable } from '@/components/shared/DataTable'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const schema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Must be at least 8 characters'),
  role: z.string().min(1, 'Required'),
})
type FormValues = z.infer<typeof schema>

function RoleCell({ user, roles }: { user: User; roles: string[] }) {
  const updateUser = useUpdateUser(user.id)

  async function handleChange(role: string) {
    try {
      await updateUser.mutateAsync({ role })
      toast.success(`${user.name}'s role changed to ${role}.`)
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  // Vendor-portal accounts aren't manageable here (they're provisioned via portal
  // activation, tied to a vendor record) — show the role as plain text rather than a
  // dropdown that can't actually offer "Vendor" as an option.
  if (!roles.includes(user.role)) {
    return <span className="text-muted-foreground">{user.role}</span>
  }

  return (
    <Select value={user.role} onValueChange={handleChange} disabled={updateUser.isPending}>
      <SelectTrigger className="h-8 w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role} value={role}>
            {role}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function StatusCell({ user, isSelf }: { user: User; isSelf: boolean }) {
  const updateUser = useUpdateUser(user.id)

  async function handleToggle() {
    try {
      await updateUser.mutateAsync({ is_active: !user.is_active })
      toast.success(user.is_active ? `${user.name} deactivated.` : `${user.name} reactivated.`)
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  return (
    <div className="flex items-center gap-space-2">
      <Badge variant={user.is_active ? 'success' : 'neutral'}>{user.is_active ? 'Active' : 'Inactive'}</Badge>
      {user.is_active ? (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" size="sm" disabled={isSelf || updateUser.isPending}>
              Deactivate
            </Button>
          }
          title={`Deactivate ${user.name}?`}
          description="They'll immediately lose access and won't be able to log in until reactivated."
          confirmLabel="Deactivate"
          destructive
          onConfirm={handleToggle}
        />
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={updateUser.isPending} onClick={handleToggle}>
          Reactivate
        </Button>
      )}
    </div>
  )
}

function ResetPasswordCell({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const resetPassword = useResetPassword(user.id)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setPassword('')
      setError('')
    }
  }

  async function handleReset() {
    if (password.length < 8) {
      setError('Must be at least 8 characters')
      return
    }
    try {
      await resetPassword.mutateAsync(password)
      toast.success(`Password reset for ${user.name}. Share it with them directly.`)
      handleOpenChange(false)
    } catch (err) {
      setError(friendlyMessage(err))
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Reset Password
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset password for {user.name}</AlertDialogTitle>
          <AlertDialogDescription>
            Sets a new password immediately and signs them out everywhere. Share the new password with them
            directly — this doesn't send an email.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div>
          <Label htmlFor={`new-password-${user.id}`}>New password</Label>
          <Input
            id={`new-password-${user.id}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
          {error && <p className="mt-1 text-size-5 text-destructive">{error}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button type="button" onClick={handleReset} disabled={resetPassword.isPending}>
            Reset Password
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function UserManagementPage() {
  const { user: currentUser } = useAuth()
  const { data: users, isLoading } = useAllUsers()
  const { data: roles } = useAssignableRoles()
  const createUser = useCreateUser()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      { header: 'Name', accessorKey: 'name' },
      { header: 'Email', accessorKey: 'email' },
      {
        header: 'Role',
        accessorKey: 'role',
        cell: ({ row }) => <RoleCell user={row.original} roles={roles ?? [row.original.role]} />,
      },
      {
        header: 'Status',
        accessorKey: 'is_active',
        cell: ({ row }) => <StatusCell user={row.original} isSelf={row.original.id === currentUser?.id} />,
      },
      {
        header: 'Actions',
        id: 'actions',
        cell: ({ row }) => <ResetPasswordCell user={row.original} />,
      },
    ],
    [roles, currentUser?.id],
  )

  async function onSubmit(values: FormValues) {
    try {
      await createUser.mutateAsync(values)
      toast.success(`${values.name} created — share their password with them directly.`)
      reset({ name: '', email: '', password: '', role: values.role })
    } catch (err) {
      setError('root', { message: friendlyMessage(err) })
    }
  }

  return (
    <div className="flex flex-col gap-space-2">
      <h1 className="font-heading text-size-1 font-bold">User Management</h1>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Add User</h2>
          {errors.root && <p className="mb-space-2 text-size-4 text-destructive">{errors.root.message}</p>}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="mt-1 text-size-5 text-destructive">{errors.name.message}</p>}

            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="mt-1 text-size-5 text-destructive">{errors.email.message}</p>}

            <Label htmlFor="password">Temporary Password</Label>
            <Input id="password" {...register('password')} autoComplete="off" />
            {errors.password && <p className="mt-1 text-size-5 text-destructive">{errors.password.message}</p>}

            <Label htmlFor="role">Role</Label>
            <Controller
              name="role"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {(roles ?? []).map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.role && <p className="mt-1 text-size-5 text-destructive">{errors.role.message}</p>}

            <Button type="submit" className="mt-space-3" disabled={isSubmitting}>
              Create User
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <DataTable
            columns={columns}
            data={users ?? []}
            searchable
            searchPlaceholder="Search users…"
            isLoading={isLoading}
            emptyMessage="No users yet."
          />
        </CardContent>
      </Card>
    </div>
  )
}
