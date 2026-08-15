export const portalConfig = {
  supabaseUrl: 'https://sctlkvmqxgkuwotdkduc.supabase.co',
  supabasePublishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjdGxrdm1xeGdrdXdvdGRrZHVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MjAyOTQsImV4cCI6MjA5NDk5NjI5NH0.1UWfUO_4YfCJFkHCkF3SpBptF0FVH8sbXgh3KqSiwek',
  companyCalendarName: 'Harvest Renovation Company Calendar',
  companyCalendarEmbedUrl: 'https://calendar.google.com/calendar/embed?src=harvestrenovation%40gmail.com&ctz=America%2FChicago',
  // Documenso — free, unlimited e-signature with a free API (self-hosted).
  // Replace the placeholder URLs/IDs below after deploying Documenso (see setup guide).
  documensoUrl: 'https://your-documenso-url.up.railway.app',        // ← REPLACE with your Railway URL
  documensoApiUrl: 'https://your-documenso-url.up.railway.app/api/v2', // ← REPLACE
  documensoTemplateId: 1,                                            // ← REPLACE with your template ID
  // Your API middleware URL (holds the Documenso API key securely). ← REPLACE after deploy.
  apiMiddlewareUrl: 'https://your-portal-api-url.com/api/send-document',
  bootstrapUsers: [
    {
      email: 'contactmpuentes@gmail.com',
      full_name: 'Madelyn Puentes',
      role: 'admin',
      autoApprove: true
    },
    {
      email: 'Jpuentes1992@gmail.com',
      full_name: 'Juan Puentes',
      role: 'staff',
      autoApprove: true
    }
  ]
};
