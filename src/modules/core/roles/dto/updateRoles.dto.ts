import { PartialType } from "@nestjs/swagger";
import { CreateRoles } from "./createRoles.dto";

export class UpdateRoles extends PartialType(CreateRoles)  {
 
}
