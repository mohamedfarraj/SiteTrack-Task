import { PageOptionsDto } from "../base/dto/page-options.dto";

export const GlobalPrefix = 'api';


export const SYSTEM_USERS_TYPES = [
    'admins',
    'users'
]


export const USERS_TYPES = [
    'Trading',
    'Project',
    'End User'
]

export enum Order {
    ASC = 'ASC',
    DESC = 'DESC',
}


export interface PageMetaDtoParameters {
    pageOptionsDto: PageOptionsDto;
    itemCount: number;
}