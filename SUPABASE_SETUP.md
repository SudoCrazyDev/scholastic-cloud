# Self-Hosted Supabase Setup

This Docker Compose configuration sets up a complete self-hosted Supabase instance with all core services.

## Services Included

- **PostgreSQL Database** (port 5432) - Main database with Supabase extensions
- **PostgREST** (port 3000) - REST API for database access
- **GoTrue Auth** (port 9999) - Authentication service
- **Realtime** (port 4000) - Real-time subscriptions
- **Storage API** (port 5000) - File storage service
- **Edge Functions** (port 9000) - Serverless functions runtime
- **Kong API Gateway** (port 8000) - Main API gateway
- **Supabase Studio** (port 3000) - Web dashboard
- **pg-meta** (port 8080) - Database introspection
- **Mailhog** (ports 1025, 8025) - Email testing

## Quick Start

1. **Update Configuration**
   - Replace `your-super-secret-and-long-postgres-password` with a strong password
   - Replace `your-super-secret-jwt-token-with-at-least-32-characters-long` with a secure JWT secret
   - Update URLs if needed (currently set to localhost)

2. **Start Services**
   ```bash
   docker-compose up -d
   ```

3. **Access Services**
   - **Supabase Studio**: http://localhost:3000
   - **API Gateway**: http://localhost:8000
   - **Mailhog**: http://localhost:8025
   - **pg-meta**: http://localhost:8080

## API Keys

The setup includes default API keys for testing:

- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`
- **Service Role Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU`

## API Endpoints

- **Auth**: `http://localhost:8000/auth/v1/`
- **REST**: `http://localhost:8000/rest/v1/`
- **Realtime**: `http://localhost:8000/realtime/v1/`
- **Storage**: `http://localhost:8000/storage/v1/`
- **Functions**: `http://localhost:8000/functions/v1/`

## Configuration Files

- `supabase/kong.yml` - Kong API Gateway configuration
- `supabase/seed.sql` - Database initialization script
- `supabase/functions/` - Edge Functions directory

## Security Notes

⚠️ **Important**: This is a development setup. For production:

1. Change all default passwords and secrets
2. Use proper SSL certificates
3. Configure proper email service (replace Mailhog)
4. Set up proper backup strategies
5. Configure firewall rules
6. Use environment variables for sensitive data

## Troubleshooting

1. **Check service health**:
   ```bash
   docker-compose ps
   ```

2. **View logs**:
   ```bash
   docker-compose logs [service-name]
   ```

3. **Restart services**:
   ```bash
   docker-compose restart [service-name]
   ```

4. **Reset everything**:
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```

## Integration with Your App

Update your application's Supabase configuration:

```typescript
const supabaseUrl = 'http://localhost:8000'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

## Next Steps

1. Set up your database schema
2. Configure Row Level Security (RLS) policies
3. Create Edge Functions as needed
4. Set up proper authentication flows
5. Configure storage buckets
6. Set up real-time subscriptions 