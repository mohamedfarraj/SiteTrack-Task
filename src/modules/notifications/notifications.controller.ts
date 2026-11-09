import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Notifications screen (3): invitations, newest first, plus unreadCount' })
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.notifications.list(user, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread badge shown on every page' })
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { unreadCount: await this.notifications.unreadCount(user) };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark every notification as read' })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one notification as read' })
  markRead(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.markRead(user, id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation: you join the project as a member' })
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.respond(user, id, true);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an invitation' })
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.respond(user, id, false);
  }
}
