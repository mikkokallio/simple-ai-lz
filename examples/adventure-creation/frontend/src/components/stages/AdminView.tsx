import { useState, useEffect } from 'react'
import { Adventure } from '@/types/adventure'
import { User, UserRole } from '@/types/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Users as UsersIcon, FloppyDisk, Trash, UserCircle, CheckCircle, XCircle, Clock, Crown } from '@phosphor-icons/react'
import { adminAPI } from '@/lib/api'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AdminViewProps {
  adventure: Adventure
  updateAdventure: (updates: Partial<Adventure>) => void
}

const ROLE_BADGES: Record<UserRole, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any; label: string }> = {
  pending: { variant: 'outline', icon: Clock, label: 'Pending' },
  user: { variant: 'secondary', icon: UserCircle, label: 'User' },
  premium: { variant: 'default', icon: CheckCircle, label: 'Premium' },
  admin: { variant: 'destructive', icon: Crown, label: 'Admin' },
}

export default function AdminView({ adventure, updateAdventure }: AdminViewProps) {
  const [users, setUsers] = useState<User[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [templateTime, setTemplateTime] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [usersData, templatesData] = await Promise.all([
        adminAPI.listUsers(),
        adminAPI.listTemplates(),
      ])
      setUsers(usersData)
      setTemplates(templatesData)
    } catch (error) {
      console.error('Failed to load admin data:', error)
      toast.error('Failed to load admin data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateUserRole = async (userId: string, newRole: UserRole) => {
    try {
      await adminAPI.updateUserRole(userId, newRole)
      toast.success(`User role updated to ${newRole}`)
      loadData()
    } catch (error) {
      console.error('Failed to update user role:', error)
      toast.error('Failed to update user role')
    }
  }

  const handleSaveTemplate = async () => {
    if (!templateName || !templateDescription || !templateTime) {
      toast.error('Please fill in all template fields')
      return
    }

    try {
      await adminAPI.saveTemplate({
        name: templateName,
        description: templateDescription,
        timeStr: templateTime,
        encounters: adventure.structure.encounters,
        connections: adventure.structure.connections,
        createdBy: 'admin', // This should come from current user
      })
      
      toast.success('Template saved successfully')
      setSaveDialogOpen(false)
      setTemplateName('')
      setTemplateDescription('')
      setTemplateTime('')
      loadData()
    } catch (error) {
      console.error('Failed to save template:', error)
      toast.error('Failed to save template')
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return

    try {
      await adminAPI.deleteTemplate(id)
      toast.success('Template deleted')
      loadData()
    } catch (error) {
      console.error('Failed to delete template:', error)
      toast.error('Failed to delete template')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="mb-2">Admin Panel</h2>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2">Admin Panel</h2>
        <p className="text-muted-foreground">Manage users and templates</p>
      </div>

      {/* User Management */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="w-5 h-5" weight="duotone" />
            User Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No users found</p>
            ) : (
              users.map((user) => {
                const roleBadge = ROLE_BADGES[user.role]
                const Icon = roleBadge.icon
                
                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 rounded-lg border-2 border-border bg-secondary/20"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {user.picture ? (
                        <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full" />
                      ) : (
                        <UserCircle className="w-10 h-10 text-muted-foreground" weight="duotone" />
                      )}
                      <div className="flex-1">
                        <div className="font-semibold">{user.name}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                      </div>
                      <Badge variant={roleBadge.variant} className="gap-1">
                        <Icon className="w-3 h-3" weight="fill" />
                        {roleBadge.label}
                      </Badge>
                    </div>
                    <Select
                      value={user.role}
                      onValueChange={(value) => handleUpdateUserRole(user.id, value as UserRole)}
                    >
                      <SelectTrigger className="w-[140px] ml-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="premium">Premium</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Template Management */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FloppyDisk className="w-5 h-5" weight="duotone" />
              Structure Templates
            </CardTitle>
            <Button
              onClick={() => setSaveDialogOpen(true)}
              variant="secondary"
              className="gap-2"
              disabled={!adventure.structure.encounters.length}
            >
              <FloppyDisk weight="bold" />
              Save Current Structure
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No custom templates yet. Save your current structure to create one.
              </p>
            ) : (
              templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-4 rounded-lg border-2 border-border bg-secondary/20"
                >
                  <div className="flex-1">
                    <div className="font-semibold mb-1">{template.name}</div>
                    <div className="text-sm text-muted-foreground mb-2">{template.description}</div>
                    <div className="flex gap-2">
                      <Badge variant="purple" className="text-xs">
                        {template.encounters.length} encounters
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {template.timeStr}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Save Template Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Structure as Template</DialogTitle>
            <DialogDescription>
              Create a reusable template from your current adventure structure
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Urban Mystery Arc"
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Describe this template..."
                className="mt-2"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="template-time">Estimated Duration</Label>
              <Input
                id="template-time"
                value={templateTime}
                onChange={(e) => setTemplateTime(e.target.value)}
                placeholder="e.g., 4-6 hours"
                className="mt-2"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setSaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTemplate}>
                Save Template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
