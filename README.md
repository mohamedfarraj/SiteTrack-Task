# Backend

A powerful and scalable backend system built with NestJS for any applications. This project implements best practices, clean architecture, and includes many reusable components.

## 🌟 Key Features

### 1. Base Architecture
- **Base Service**: Generic CRUD operations with TypeORM
- **Base Controller**: Common controller methods
- **Base Entity**: Shared entity properties
- **Custom Decorators**: Including @UserInfo()

### 2. Authentication & Authorization
- JWT-based authentication
- Role-based access control (RBAC)
- Permission-based authorization
- Cookie-based token management
- Remember me functionality

### 3. Database
- MySQL integration with TypeORM
- Automated migrations
- Relationship management
- Soft delete support

### 4. File Management
- File upload support
- Image processing
- Multiple file uploads
- Secure file deletion

### 5. CLI Tools
Custom CLI commands for rapid development:
```bash
# Create a new module with all necessary files
npm run cli -- make:module <module-name> -p <path>
```

### 6. Email System
- Email template support (EJS)
- Multilingual email templates
- HTML and text email support
- SMTP configuration

### 7. Middleware & Interceptors
- Logging middleware
- Response transformation
- Error handling
- Request validation

## 🚀 Getting Started

### Prerequisites
- Node.js (v20 or later)
- Docker and Docker Compose
- MySQL

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configurations
```

4. Start the development environment:
```bash
docker-compose up -d
```

### Development

Start the development server:
```bash
npm run start:dev
```

### Production

Build and start for production:
```bash
npm run start:deploy
```

## 📁 Project Structure

```
src/
├── common/                 # Shared resources
│   ├── base/              # Base classes
│   ├── commands/          # CLI commands
│   ├── decorators/        # Custom decorators
│   ├── filters/           # Exception filters
│   ├── interceptors/      # Interceptors
│   ├── middlewares/       # Middleware
│   ├── shared/           # Shared utilities
│   └── validators/        # Custom validators
├── modules/
│   ├── core/             # Core modules
│   └── system/           # System modules
├── templates/            # Email templates
└── main.ts              # Application entry
```

## 🛠 Development Tools

### CLI Commands
The project includes custom CLI commands for generating modules:

```bash
# Create a new module
npm run cli -- make:module user -p core

# This will generate:
# - Controller
# - Service
# - Entity
# - DTOs
# - Module file
# - Permissions
```

### Base Classes

The project includes several base classes for common functionality:

1. **BaseService**: Generic CRUD operations
```typescript
class YourService extends BaseService<YourEntity> {
  constructor(
    @InjectRepository(YourEntity)
    private readonly yourRepository: Repository<YourEntity>,
  ) {
    super(yourRepository);
  }
}
```

2. **BaseController**: Common controller methods
```typescript
class YourController extends BaseController<CreateYourDto> {
  constructor(private readonly yourService: YourService) {
    super(yourService);
  }
}
```

## 🔒 Security

- JWT authentication
- Role-based access control
- Request validation
- Secure file uploads
- SQL injection protection
- XSS protection

## 📧 Email Templates

Email templates are located in the `templates` directory and support:
- Multiple languages (ar, en)
- HTML and text formats
- Dynamic content injection
- Customizable layouts

## 🐳 Docker Support

The project includes Docker configuration for easy deployment:
- Node.js application container
- MySQL database container
- PHPMyAdmin for database management

## 📝 API Documentation

API documentation is automatically generated using Swagger:
- Available at `/api` endpoint
- Includes all endpoints
- Shows request/response schemas
- Allows testing endpoints directly

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request


