import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ClientCreateResultViewDto,
  CommercialRelationViewDto,
  CreateClientDto,
  CreateCommercialRelationDto,
  CreatePropertyDto,
  CreatePropertyTenantDto,
  PropertyViewDto,
  TenantAccessResultViewDto,
  UpdateCommercialRelationDto,
  UpdatePropertyDto,
  UpdateTenantDto,
} from '@/api/types';
import { api } from '@/api/client';
import { callApi } from '@/api/mutations';

/**
 * Catalog queries (spec F3 §4): properties (+tenants), own clients and
 * commercial relations of the active space. Keys keep the F0 `['company', …]`
 * prefix so switching spaces re-runs every catalog list.
 */
export const propertiesKey = (companyId: string) => ['company', companyId, 'properties'] as const;

export const propertyKey = (companyId: string, propertyId: string) =>
  ['company', companyId, 'properties', propertyId] as const;

export const clientsKey = (companyId: string) => ['company', companyId, 'clients'] as const;

export const relationsKey = (companyId: string) => ['company', companyId, 'relations'] as const;

/** Property fichas of the space (server caps the list at 100, Etapa 2). */
export function useProperties(companyId: string) {
  return useQuery({
    queryKey: propertiesKey(companyId),
    queryFn: () =>
      callApi(api.GET('/api/v1/companies/{id}/properties', { params: { path: { id: companyId } } })),
  });
}

/** Property detail with its tenants (§4.3). */
export function useProperty(companyId: string, propertyId: string) {
  return useQuery({
    queryKey: propertyKey(companyId, propertyId),
    queryFn: () =>
      callApi(
        api.GET('/api/v1/companies/{id}/properties/{propId}', {
          params: { path: { id: companyId, propId: propertyId } },
        }),
      ),
    enabled: Boolean(propertyId),
  });
}

/** Creates a ficha (any active member, §5.1) and lands on the new detail. */
export function useCreateProperty(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['createProperty', companyId],
    mutationFn: (input: CreatePropertyDto) =>
      callApi(
        api.POST('/api/v1/companies/{id}/properties', {
          params: { path: { id: companyId } },
          body: input,
        }),
      ),
    onSuccess: async (property: PropertyViewDto) => {
      await queryClient.invalidateQueries({ queryKey: propertiesKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: propertyKey(companyId, property.id) });
    },
  });
}

/** Edits the official data (§4.4): property_management spaces only (403 else). */
export function useUpdateProperty(companyId: string, propertyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['updateProperty', companyId, propertyId],
    mutationFn: (input: UpdatePropertyDto) =>
      callApi(
        api.PATCH('/api/v1/companies/{id}/properties/{propId}', {
          params: { path: { id: companyId, propId: propertyId } },
          body: input,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: propertiesKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: propertyKey(companyId, propertyId) });
    },
  });
}

/** Adds a tenant (any active member); `accessIssued` reports the emailed link (§4.3). */
export function useAddTenant(companyId: string, propertyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['addTenant', companyId, propertyId],
    mutationFn: (input: CreatePropertyTenantDto) =>
      callApi(
        api.POST('/api/v1/companies/{id}/properties/{propId}/tenants', {
          params: { path: { id: companyId, propId: propertyId } },
          body: input,
        }),
      ),
    onSuccess: async (_result: TenantAccessResultViewDto) => {
      await queryClient.invalidateQueries({ queryKey: propertyKey(companyId, propertyId) });
    },
  });
}

/** Edits a tenant's operational data (`UpdateTenantDto`: no email, no kind). */
export function useUpdateTenant(companyId: string, propertyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['updateTenant', companyId, propertyId],
    mutationFn: (input: { tenantId: string } & UpdateTenantDto) =>
      callApi(
        api.PATCH('/api/v1/companies/{id}/tenants/{tenantId}', {
          params: { path: { id: companyId, tenantId: input.tenantId } },
          body: {
            name: input.name,
            phones: input.phones,
            address: input.address,
            availability: input.availability,
          },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: propertyKey(companyId, propertyId) });
    },
  });
}

/** Own clients of an own_business professional (§2.3). */
export function useClients(companyId: string) {
  return useQuery({
    queryKey: clientsKey(companyId),
    queryFn: () =>
      callApi(api.GET('/api/v1/companies/{id}/clients', { params: { path: { id: companyId } } })),
  });
}

/** Registers a client; `accessIssued` reports the emailed limited link (§4.3). */
export function useCreateClient(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['createClient', companyId],
    mutationFn: (input: CreateClientDto) =>
      callApi(
        api.POST('/api/v1/companies/{id}/clients', {
          params: { path: { id: companyId } },
          body: input,
        }),
      ),
    onSuccess: async (_result: ClientCreateResultViewDto) => {
      await queryClient.invalidateQueries({ queryKey: clientsKey(companyId) });
    },
  });
}

/** Commercial relations of the space (§2.4); any active member reads (Etapa 4 #48). */
export function useRelations(companyId: string) {
  return useQuery({
    queryKey: relationsKey(companyId),
    queryFn: () =>
      callApi(
        api.GET('/api/v1/companies/{id}/commercial-relations', {
          params: { path: { id: companyId } },
        }),
      ),
  });
}

/** Creates a relation (owner-only server-side, Etapa 4 decisión 7). */
export function useCreateRelation(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['createRelation', companyId],
    mutationFn: (input: CreateCommercialRelationDto) =>
      callApi(
        api.POST('/api/v1/companies/{id}/commercial-relations', {
          params: { path: { id: companyId } },
          body: input,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: relationsKey(companyId) });
    },
  });
}

/** Edits label/policy or closes/reopens the relation (owner-only, §2.4, §8.6). */
export function useUpdateRelation(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['updateRelation', companyId],
    mutationFn: (input: { relationId: string } & UpdateCommercialRelationDto) =>
      callApi(
        api.PATCH('/api/v1/companies/{id}/commercial-relations/{relationId}', {
          params: { path: { id: companyId, relationId: input.relationId } },
          body: {
            label: input.label,
            emergencyPolicy: input.emergencyPolicy,
            emergencyExtraAmount: input.emergencyExtraAmount,
            ended: input.ended,
          },
        }),
      ),
    onSuccess: async (_result: CommercialRelationViewDto) => {
      await queryClient.invalidateQueries({ queryKey: relationsKey(companyId) });
    },
  });
}
