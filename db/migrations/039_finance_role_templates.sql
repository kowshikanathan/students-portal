-- Role templates grant no membership. Owners still explicitly assign staff.
CREATE FUNCTION install_finance_role_templates(target_tenant uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO tenant_roles(tenant_id,role_key,name,description,grants,explicit_denies,status,version,published_at)
  SELECT target_tenant,v.role_key,v.name,'Finance role template',v.grants::jsonb,'[]'::jsonb,'published',1,now()
  FROM (VALUES
    ('institute_admin','Institute Admin','["dashboard.read","fee.read","report.read","customer.read","customer.create","customer.import","import.commit","catalogue.edit","fee.plan.manage","fee.schedule.edit","fee.adjust.request","approval.decide","payment.evidence.record","refund.approve","enach.manage","enach.recover","settlement.manage","reconciliation.manage","payer.manage"]'),
    ('finance_manager','Finance Manager','["dashboard.read","fee.read","report.read","customer.read","customer.create","fee.plan.manage","fee.schedule.edit","fee.adjust.request","approval.decide","payment.evidence.record","refund.approve","enach.manage","enach.recover","settlement.manage","reconciliation.manage","payer.manage"]'),
    ('accountant','Accountant','["dashboard.read","fee.read","report.read","customer.read","customer.create","fee.adjust.request","payment.evidence.record","payer.manage"]'),
    ('collection_executive','Collection Executive','["dashboard.read","fee.read","report.read","customer.read","payment.evidence.record","enach.manage","enach.recover","payer.manage"]'),
    ('viewer','Viewer','["dashboard.read","fee.read","report.read","customer.read"]')
  ) AS v(role_key,name,grants)
  WHERE NOT EXISTS (SELECT 1 FROM tenant_roles r WHERE r.tenant_id=target_tenant AND r.role_key=v.role_key);
$$;
SELECT install_finance_role_templates(id) FROM tenants;
CREATE FUNCTION install_new_tenant_finance_roles() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM install_finance_role_templates(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenant_finance_role_templates AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION install_new_tenant_finance_roles();
