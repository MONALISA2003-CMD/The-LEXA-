import { BadRequestException, Body, Controller, Get, Param, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AccountProtectionService } from './account-protection.service';
import { CsrfGuard } from '../core/csrf.guard';

function payload(value: unknown): Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new BadRequestException('Enter the required information.');
  return value as Record<string,unknown>;
}
@Controller('auth')
export class AccountSecurityController {
  constructor(private readonly protection:AccountProtectionService) {}
  @Post('login/verify') @UseGuards(CsrfGuard)
  verify(@Body() raw:unknown,@Req() req:FastifyRequest,@Res({passthrough:true}) reply:FastifyReply) {
    return this.protection.finishSignIn(raw,req,reply);
  }
  @Post('account/close') @UseGuards(CsrfGuard)
  closePersonalAccount(@Req() req:FastifyRequest,@Body() raw:unknown,@Res({passthrough:true}) reply:FastifyReply){return this.protection.closePersonalAccount(req,raw,reply);}
  @Get('security')
  security(@Req() req:FastifyRequest){return this.protection.listSecurity(req);}
  @Post('security/sessions/other/revoke') @UseGuards(CsrfGuard)
  revokeOtherSessions(@Req() req:FastifyRequest,@Body() raw:unknown){return this.protection.revokeOtherSessions(req,payload(raw).password);}
  @Post('security/sessions/:sessionId/revoke') @UseGuards(CsrfGuard)
  revokeSession(@Req() req:FastifyRequest,@Param('sessionId') id:string,@Body() raw:unknown,@Res({passthrough:true}) reply:FastifyReply){return this.protection.revokeSession(req,id,payload(raw).password,reply);}
  @Post('security/devices/:deviceId/revoke') @UseGuards(CsrfGuard)
  revokeDevice(@Req() req:FastifyRequest,@Param('deviceId') id:string,@Body() raw:unknown,@Res({passthrough:true}) reply:FastifyReply){return this.protection.revokeDevice(req,id,payload(raw).password,reply);}
  @Post('security/authenticator/begin') @UseGuards(CsrfGuard)
  beginAuthenticator(@Req() req:FastifyRequest,@Body() raw:unknown){return this.protection.beginAuthenticator(req,payload(raw).password);}
  @Post('security/authenticator/confirm') @UseGuards(CsrfGuard)
  confirmAuthenticator(@Req() req:FastifyRequest,@Body() raw:unknown){return this.protection.confirmAuthenticator(req,payload(raw).code);}
  @Post('security/authenticator/disable') @UseGuards(CsrfGuard)
  disableAuthenticator(@Req() req:FastifyRequest,@Body() raw:unknown){const data=payload(raw);return this.protection.disableAuthenticator(req,data.password,data.code);}
  @Post('security/authenticator/recovery/replace') @UseGuards(CsrfGuard)
  replaceRecoveryCodes(@Req() req:FastifyRequest,@Body() raw:unknown){const data=payload(raw);return this.protection.regenerateRecoveryCodes(req,data.password,data.code);}
  @Get('privacy/preferences')
  readPrivacy(@Req() req:FastifyRequest){return this.protection.readPrivacy(req);}
  @Put('privacy/preferences') @UseGuards(CsrfGuard)
  updatePrivacy(@Req() req:FastifyRequest,@Body() raw:unknown){return this.protection.updatePrivacy(req,raw);}
}
