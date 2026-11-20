// Authentication and account views never need encrypted identity images.
export const accountColumns=role=>'id,phone,email,email_verified_at,identity_status,suspended,'+(role==='vendor'?'owner_key,profile':'display_name,public_profile');
