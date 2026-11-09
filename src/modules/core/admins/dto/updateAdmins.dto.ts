import { PartialType } from "@nestjs/swagger";
import { CreateAdmins } from "./createAdmins.dto";

export class UpdateAdmins extends PartialType(CreateAdmins)  {
 
}
