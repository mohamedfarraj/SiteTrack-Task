import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { InviteDto, UpdateMemberDto } from './members.dto';
import { MembersService } from './members.service';

@ApiTags('Project members & invitations')
@ApiBearerAuth()
@ApiParam({ name: 'projectCode', example: 'PRJ-0042' })
@Controller('projects/:projectCode')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  @ApiOperation({ summary: 'Members screen (9): members and who is a project admin' })
  listMembers(@CurrentUser() user: AuthUser, @Param('projectCode') code: string) {
    return this.members.listMembers(user, code);
  }

  @Patch('members/:userId')
  @ApiOperation({ summary: 'Make a member a project admin, or demote one (project admins)' })
  setAdmin(
    @CurrentUser() user: AuthUser,
    @Param('projectCode') code: string,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.members.setAdmin(user, code, userId, dto.isAdmin);
  }

  @Delete('members/:userId')
  @ApiOperation({ summary: 'Remove a member (project admins), or leave the project (own user id)' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('projectCode') code: string,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.members.remove(user, code, userId);
  }

  @Get('invitations')
  @ApiOperation({ summary: 'Invitations not yet answered' })
  listInvitations(@CurrentUser() user: AuthUser, @Param('projectCode') code: string) {
    return this.members.listPendingInvitations(user, code);
  }

  @Post('invitations')
  @ApiOperation({ summary: 'Invite a registered user by email (project admins)' })
  invite(@CurrentUser() user: AuthUser, @Param('projectCode') code: string, @Body() dto: InviteDto) {
    return this.members.invite(user, code, dto.email);
  }

  @Delete('invitations/:invitationId')
  @ApiOperation({ summary: 'Withdraw an unanswered invitation (project admins)' })
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param('projectCode') code: string,
    @Param('invitationId', ParseIntPipe) invitationId: number,
  ) {
    return this.members.withdraw(user, code, invitationId);
  }
}
