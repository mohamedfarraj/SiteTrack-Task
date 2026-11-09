// roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class LinkGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;  // يجب أن يكون المستخدم مصادق عليه

    console.log(user)
    const allowedLinksForUser = ['/user/profile', '/user/settings'];  // روابط مسموح بها للمستخدمين

    if (allowedLinksForUser.includes(request.path)) {
      return true;  // السماح بالمرور
    }

    return false;  // منع الوصول إذا لم يكن الرابط مسموحًا به
  }
}
