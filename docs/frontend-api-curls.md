using System;
using System.Activities;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Microsoft.Xrm.Sdk.Workflow;

namespace bulkimport
{
    public sealed class BulkUsersImportActivity : CodeActivity
    {
        private const string BulkImportEntityName = "ia_bulkusersimport";
        private const string OrganizationEntityName = "ia_organization";
        private const string UserEntityName = "ia_user";
        private const string MembershipEntityName = "ia_organizationmembership";
        private const string OrganizationRoleEntityName = "ia_organizationrole";
        private const int StatusValidating = 226660000;
        private const int StatusProcessing = 226660001;
        private const int StatusCompleted = 226660002;
        private const int StatusFailed = 226660003;

        [Input("Org Name")]
        public InArgument<string> OrgName { get; set; }

        [Input("User First Name")]
        public InArgument<string> UserFirstName { get; set; }

        [Input("User Last Name")]
        public InArgument<string> UserLastName { get; set; }

        [Input("User Phone")]
        public InArgument<string> UserPhone { get; set; }

        [Input("User Email")]
        public InArgument<string> UserEmail { get; set; }

        [Input("Location Name")]
        public InArgument<string> LocationName { get; set; }

        [Input("Org Role")]
        public InArgument<string> OrgRole { get; set; }

        protected override void Execute(CodeActivityContext executionContext)
        {
            ITracingService tracingService = executionContext.GetExtension<ITracingService>();
            IWorkflowContext workflowContext = executionContext.GetExtension<IWorkflowContext>();
            IOrganizationServiceFactory serviceFactory = executionContext.GetExtension<IOrganizationServiceFactory>();
            IOrganizationService service = serviceFactory.CreateOrganizationService(workflowContext.UserId);

            if (!string.Equals(workflowContext.PrimaryEntityName, BulkImportEntityName, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidPluginExecutionException("This workflow activity must run against Bulk Users Import records.");
            }

            if (ShouldSkipTriggeredStatusUpdate(service, workflowContext))
            {
                tracingService.Trace(
                    "Bulk user import skipped for {0} because the current status indicates an in-progress or completed system update.",
                    workflowContext.PrimaryEntityId);
                return;
            }

            BulkUserImportData importData = new BulkUserImportData
            {
                OrgName = OrgName.Get(executionContext),
                UserFirstName = UserFirstName.Get(executionContext),
                UserLastName = UserLastName.Get(executionContext),
                UserPhone = UserPhone.Get(executionContext),
                UserEmail = UserEmail.Get(executionContext),
                LocationName = LocationName.Get(executionContext),
                OrgRole = OrgRole.Get(executionContext)
            };

            try
            {
                SetImportStatus(service, workflowContext.PrimaryEntityId, StatusValidating);
                bool wasProcessed = ProcessImportRecord(service, importData, workflowContext.PrimaryEntityId);
                if (wasProcessed)
                {
                    SetImportCompleted(service, workflowContext.PrimaryEntityId);
                }
            }
            catch (Exception ex)
            {
                tracingService.Trace("Bulk user import failed for {0}: {1}", workflowContext.PrimaryEntityId, ex);
                SetImportError(service, workflowContext.PrimaryEntityId, GetErrorLogMessage(ex));
            }
        }

        private static bool ProcessImportRecord(IOrganizationService service, BulkUserImportData importData, Guid importRecordId)
        {
            NormalizeImportData(importData);

            ImportValidationResult validation = ValidateImportData(service, importData);
            if (validation.Errors.Count > 0)
            {
                SetImportFailed(service, importRecordId, BuildValidationMessage(validation.Errors));
                return false;
            }

            SetImportStatus(service, importRecordId, StatusProcessing);

            Guid userId = validation.User == null ? CreateUser(service, importData) : validation.User.Id;

            CreateOrganizationMembership(
                service,
                importData,
                userId,
                validation.LocationOrganization.Id,
                validation.ParentOrganization.Id,
                validation.OrganizationRole.Id);

            return true;
        }

        private static ImportValidationResult ValidateImportData(IOrganizationService service, BulkUserImportData importData)
        {
            ImportValidationResult result = new ImportValidationResult();

            if (string.IsNullOrWhiteSpace(importData.OrgName))
            {
                result.Errors.Add("Org Name is required.");
            }

            if (string.IsNullOrWhiteSpace(importData.UserEmail))
            {
                result.Errors.Add("User Email is required.");
            }

            if (string.IsNullOrWhiteSpace(importData.LocationName))
            {
                result.Errors.Add("Location Name is required.");
            }

            if (string.IsNullOrWhiteSpace(importData.OrgRole))
            {
                result.Errors.Add("Org Role is required.");
            }

            if (!string.IsNullOrWhiteSpace(importData.OrgName))
            {
                result.ParentOrganization = FindSingleByAnyText(
                    service,
                    OrganizationEntityName,
                    importData.OrgName,
                    new[] { "ia_orgname", "ia_code" },
                    "ia_organizationid");

                if (result.ParentOrganization == null)
                {
                    result.Errors.Add($"Parent Organization '{importData.OrgName}' does not exist by name or code.");
                }
            }

            if (!string.IsNullOrWhiteSpace(importData.LocationName))
            {
                result.LocationOrganization = FindSingleByAnyText(
                    service,
                    OrganizationEntityName,
                    importData.LocationName,
                    new[] { "ia_orgname", "ia_code" },
                    "ia_organizationid");

                if (result.LocationOrganization == null)
                {
                    result.Errors.Add($"Location Organization '{importData.LocationName}' does not exist by name or code.");
                }
            }

            if (!string.IsNullOrWhiteSpace(importData.OrgRole))
            {
                result.OrganizationRole = FindSingleByAnyText(
                    service,
                    OrganizationRoleEntityName,
                    importData.OrgRole,
                    new[] { "ia_name", "ia_code" },
                    "ia_organizationroleid");

                if (result.OrganizationRole == null)
                {
                    result.Errors.Add($"Organization Role '{importData.OrgRole}' does not exist by name or code.");
                }
            }

            if (!string.IsNullOrWhiteSpace(importData.UserEmail))
            {
                result.User = FindSingleByText(service, UserEntityName, "ia_email", importData.UserEmail, "ia_userid");
            }

            if (result.User != null && result.LocationOrganization != null && result.OrganizationRole != null)
            {
                if (MembershipExists(service, result.User.Id, result.LocationOrganization.Id, result.OrganizationRole.Id))
                {
                    result.Errors.Add("Duplicate membership: this user already has the same organization and organization role.");
                }
            }

            return result;
        }

        private static Guid CreateUser(IOrganizationService service, BulkUserImportData importData)
        {
            Entity user = new Entity(UserEntityName);
            SetIfHasValue(user, "ia_firstname", importData.UserFirstName);
            SetIfHasValue(user, "ia_lastname", importData.UserLastName);
            SetIfHasValue(user, "ia_phone", importData.UserPhone);
            user["ia_email"] = importData.UserEmail;

            return service.Create(user);
        }

        private static void CreateOrganizationMembership(
            IOrganizationService service,
            BulkUserImportData importData,
            Guid userId,
            Guid organizationId,
            Guid parentOrganizationId,
            Guid organizationRoleId)
        {
            Entity membership = new Entity(MembershipEntityName);

            membership["ia_name"] = BuildMembershipName(importData.UserFirstName, importData.UserLastName, importData.LocationName);
            membership["ia_userid"] = new EntityReference(UserEntityName, userId);
            membership["ia_organizationid"] = new EntityReference(OrganizationEntityName, organizationId);
            membership["ia_parentorganizationid"] = new EntityReference(OrganizationEntityName, parentOrganizationId);
            membership["ia_organizationroleid"] = new EntityReference(OrganizationRoleEntityName, organizationRoleId);
            membership["ia_startdate"] = DateTime.UtcNow;
            membership["ia_islatest"] = true;

            service.Create(membership);
        }

        private static void SetImportError(IOrganizationService service, Guid importRecordId, string errorMessage)
        {
            SetImportFailed(service, importRecordId, errorMessage);
        }

        private static void SetImportFailed(IOrganizationService service, Guid importRecordId, string errorMessage)
        {
            Entity update = new Entity(BulkImportEntityName, importRecordId);
            update["ia_errorlog"] = errorMessage;
            update["ia_status"] = new OptionSetValue(StatusFailed);
            service.Update(update);
        }

        private static void SetImportCompleted(IOrganizationService service, Guid importRecordId)
        {
            Entity update = new Entity(BulkImportEntityName, importRecordId);
            update["ia_errorlog"] = null;
            update["ia_status"] = new OptionSetValue(StatusCompleted);
            update["statecode"] = new OptionSetValue(1);
            update["statuscode"] = new OptionSetValue(2);
            service.Update(update);
        }

        private static void SetImportStatus(IOrganizationService service, Guid importRecordId, int statusValue)
        {
            Entity update = new Entity(BulkImportEntityName, importRecordId);
            update["ia_status"] = new OptionSetValue(statusValue);
            service.Update(update);
        }

        private static Entity FindSingleByText(
            IOrganizationService service,
            string entityName,
            string attributeName,
            string value,
            params string[] columns)
        {
            QueryExpression query = new QueryExpression(entityName)
            {
                ColumnSet = columns == null || columns.Length == 0 ? new ColumnSet(false) : new ColumnSet(columns),
                TopCount = 1
            };

            query.Criteria.AddCondition(attributeName, ConditionOperator.Equal, value);

            EntityCollection results = service.RetrieveMultiple(query);
            return results.Entities.Count == 0 ? null : results.Entities[0];
        }

        private static bool ShouldSkipTriggeredStatusUpdate(IOrganizationService service, IWorkflowContext workflowContext)
        {
            if (!string.Equals(workflowContext.MessageName, "Update", StringComparison.OrdinalIgnoreCase) ||
                workflowContext.Depth <= 1)
            {
                return false;
            }

            Entity importRecord = service.Retrieve(BulkImportEntityName, workflowContext.PrimaryEntityId, new ColumnSet("ia_status"));
            OptionSetValue status = importRecord.GetAttributeValue<OptionSetValue>("ia_status");

            if (status == null || status.Value == StatusFailed)
            {
                return false;
            }

            return status.Value == StatusValidating ||
                status.Value == StatusProcessing ||
                status.Value == StatusCompleted;
        }

        private static Entity FindSingleByAnyText(
            IOrganizationService service,
            string entityName,
            string value,
            string[] attributeNames,
            params string[] columns)
        {
            QueryExpression query = new QueryExpression(entityName)
            {
                ColumnSet = columns == null || columns.Length == 0 ? new ColumnSet(false) : new ColumnSet(columns),
                TopCount = 1
            };

            FilterExpression anyMatch = new FilterExpression(LogicalOperator.Or);
            foreach (string attributeName in attributeNames)
            {
                anyMatch.AddCondition(attributeName, ConditionOperator.Equal, value);
            }

            query.Criteria.AddFilter(anyMatch);

            EntityCollection results = service.RetrieveMultiple(query);
            return results.Entities.Count == 0 ? null : results.Entities[0];
        }

        private static bool MembershipExists(IOrganizationService service, Guid userId, Guid organizationId, Guid organizationRoleId)
        {
            QueryExpression query = new QueryExpression(MembershipEntityName)
            {
                ColumnSet = new ColumnSet(false),
                TopCount = 1
            };

            query.Criteria.AddCondition("ia_userid", ConditionOperator.Equal, userId);
            query.Criteria.AddCondition("ia_organizationid", ConditionOperator.Equal, organizationId);
            query.Criteria.AddCondition("ia_organizationroleid", ConditionOperator.Equal, organizationRoleId);

            return service.RetrieveMultiple(query).Entities.Count > 0;
        }

        private static string BuildValidationMessage(List<string> errors)
        {
            return string.Join(Environment.NewLine, errors);
        }

        private static string GetErrorLogMessage(Exception ex)
        {
            if (ex is InvalidPluginExecutionException)
            {
                return ex.Message;
            }

            return "Unexpected error while processing bulk user import: " + ex.Message;
        }

        private static void SetIfHasValue(Entity target, string targetAttribute, string value)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                target[targetAttribute] = value.Trim();
            }
        }

        private static string BuildMembershipName(string firstName, string lastName, string orgName)
        {
            string fullName = string.Join(" ", new[] { firstName, lastName }).Trim();
            if (string.IsNullOrWhiteSpace(fullName))
            {
                return orgName;
            }

            return string.IsNullOrWhiteSpace(orgName) ? fullName : $"{fullName} - {orgName}";
        }

        private static void NormalizeImportData(BulkUserImportData importData)
        {
            importData.OrgName = TrimToNull(importData.OrgName);
            importData.UserFirstName = TrimToNull(importData.UserFirstName);
            importData.UserLastName = TrimToNull(importData.UserLastName);
            importData.UserPhone = TrimToNull(importData.UserPhone);
            importData.UserEmail = TrimToNull(importData.UserEmail);
            importData.LocationName = TrimToNull(importData.LocationName);
            importData.OrgRole = TrimToNull(importData.OrgRole);

            if (!string.IsNullOrWhiteSpace(importData.UserEmail))
            {
                importData.UserEmail = importData.UserEmail.ToLowerInvariant();
            }
        }

        private static string TrimToNull(string value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        private sealed class ImportValidationResult
        {
            public List<string> Errors { get; } = new List<string>();

            public Entity ParentOrganization { get; set; }

            public Entity LocationOrganization { get; set; }

            public Entity OrganizationRole { get; set; }

            public Entity User { get; set; }
        }

        private sealed class BulkUserImportData
        {
            public string OrgName { get; set; }

            public string UserFirstName { get; set; }

            public string UserLastName { get; set; }

            public string UserPhone { get; set; }

            public string UserEmail { get; set; }

            public string LocationName { get; set; }

            public string OrgRole { get; set; }
        }
    }
}
