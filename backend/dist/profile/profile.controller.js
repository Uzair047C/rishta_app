"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileController = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const auth_1 = require("../auth/auth");
const users_service_1 = require("../users/users.service");
const profile_service_1 = require("./profile.service");
const GENDERS = ['male', 'female', 'other'];
const MARITAL = ['never_married', 'divorced', 'separated', 'annulled', 'widowed', 'married'];
const SECTS = ['sunni', 'shia', 'other', 'prefer_not_to_say'];
const PRACTICE = ['strictly', 'actively', 'occasionally', 'not_practising'];
class ProfileDto {
    name;
    gender;
    /** Picker-supplied ISO date. Age itself is enforced server-side, see ProfileService. */
    dob;
    location;
    lat;
    lng;
    bio;
    education;
    profession;
    sect;
    nationality;
    ethnicity;
    maritalStatus;
    relationshipTimelineIntent;
    marriageTimelineIntent;
    religiousPracticeLevel;
    drinksAlcohol;
    wouldMoveAbroad;
    personalityTraits;
    /** Fixed tag ids from GET /profile/interests — no free-text interests. */
    interestIds;
    languageIds;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], ProfileDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(GENDERS),
    __metadata("design:type", String)
], ProfileDto.prototype, "gender", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], ProfileDto.prototype, "dob", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], ProfileDto.prototype, "location", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(-90),
    (0, class_validator_1.Max)(90),
    __metadata("design:type", Number)
], ProfileDto.prototype, "lat", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(-180),
    (0, class_validator_1.Max)(180),
    __metadata("design:type", Number)
], ProfileDto.prototype, "lng", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], ProfileDto.prototype, "bio", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], ProfileDto.prototype, "education", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], ProfileDto.prototype, "profession", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(SECTS),
    __metadata("design:type", String)
], ProfileDto.prototype, "sect", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], ProfileDto.prototype, "nationality", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], ProfileDto.prototype, "ethnicity", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(MARITAL),
    __metadata("design:type", String)
], ProfileDto.prototype, "maritalStatus", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], ProfileDto.prototype, "relationshipTimelineIntent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], ProfileDto.prototype, "marriageTimelineIntent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(PRACTICE),
    __metadata("design:type", String)
], ProfileDto.prototype, "religiousPracticeLevel", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ProfileDto.prototype, "drinksAlcohol", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ProfileDto.prototype, "wouldMoveAbroad", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], ProfileDto.prototype, "personalityTraits", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsInt)({ each: true }),
    __metadata("design:type", Array)
], ProfileDto.prototype, "interestIds", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsInt)({ each: true }),
    __metadata("design:type", Array)
], ProfileDto.prototype, "languageIds", void 0);
class PhotoDto {
    url;
    makePrimary;
}
__decorate([
    (0, class_validator_1.IsUrl)({ require_tld: false }),
    __metadata("design:type", String)
], PhotoDto.prototype, "url", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], PhotoDto.prototype, "makePrimary", void 0);
class SetPhotosDto {
    urls;
}
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsUrl)({ require_tld: false }, { each: true }),
    __metadata("design:type", Array)
], SetPhotosDto.prototype, "urls", void 0);
let ProfileController = class ProfileController {
    profiles;
    users;
    constructor(profiles, users) {
        this.profiles = profiles;
        this.users = users;
    }
    /** Closed tag set — what makes interest-overlap ranking computable. */
    async tags() {
        const [interests, languages] = await Promise.all([
            this.profiles.interests(),
            this.profiles.languages(),
        ]);
        const categorized = this.profiles.interestsCategorized();
        return { interests, languages, categorized };
    }
    professions() {
        return this.profiles.professions();
    }
    nationalities() {
        return this.profiles.nationalities();
    }
    ethnicities() {
        return this.profiles.ethnicities();
    }
    personalityTraits() {
        return this.profiles.personalityTraits();
    }
    async me(principal) {
        const user = await this.users.require(principal.uid);
        return this.profiles.me(user.id);
    }
    async save(principal, dto) {
        const user = await this.users.require(principal.uid);
        return this.profiles.upsert(user, dto);
    }
    async addPhoto(principal, dto) {
        const user = await this.users.require(principal.uid);
        return this.profiles.addPhoto(user.id, dto.url, dto.makePrimary);
    }
    async setPhotos(principal, dto) {
        const user = await this.users.require(principal.uid);
        return this.profiles.setPhotos(user.id, dto.urls);
    }
};
exports.ProfileController = ProfileController;
__decorate([
    (0, auth_1.Public)(),
    (0, common_1.Get)('interests'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ProfileController.prototype, "tags", null);
__decorate([
    (0, auth_1.Public)(),
    (0, common_1.Get)('professions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProfileController.prototype, "professions", null);
__decorate([
    (0, auth_1.Public)(),
    (0, common_1.Get)('nationalities'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProfileController.prototype, "nationalities", null);
__decorate([
    (0, auth_1.Public)(),
    (0, common_1.Get)('ethnicities'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProfileController.prototype, "ethnicities", null);
__decorate([
    (0, auth_1.Public)(),
    (0, common_1.Get)('personality-traits'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ProfileController.prototype, "personalityTraits", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, auth_1.Auth)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ProfileController.prototype, "me", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ProfileDto]),
    __metadata("design:returntype", Promise)
], ProfileController.prototype, "save", null);
__decorate([
    (0, common_1.Post)('photo'),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, PhotoDto]),
    __metadata("design:returntype", Promise)
], ProfileController.prototype, "addPhoto", null);
__decorate([
    (0, common_1.Post)('photos'),
    __param(0, (0, auth_1.Auth)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, SetPhotosDto]),
    __metadata("design:returntype", Promise)
], ProfileController.prototype, "setPhotos", null);
exports.ProfileController = ProfileController = __decorate([
    (0, common_1.Controller)('profile'),
    __metadata("design:paramtypes", [profile_service_1.ProfileService,
        users_service_1.UsersService])
], ProfileController);
//# sourceMappingURL=profile.controller.js.map