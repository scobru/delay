/**
 * OpenAPI Specification Generator
 * Generates a complete OpenAPI 3.0 specification for Delay API
 */

// OpenAPI types - using obj for the complex nested structure
interface OpenAPISpec {
  openapi: string;
  info: Record<string, any>;
  servers: Array<Record<string, any>>;
  components: Record<string, any>;
  security: Array<Record<string, any>>;
  paths: Record<string, any>;
}

export function generateOpenAPISpec(baseUrl: string = "http://localhost:8421"): OpenAPISpec {
  return {
    openapi: "3.0.0",
    info: {
      title: "Delay API",
      version: "1.0.0",
      description:
        "Complete API documentation for Delay. Test endpoints directly from the interactive documentation.",
      contact: {
        name: "Shogun Project",
        url: "https://github.com/scobru/shogun",
      },
      license: {
        name: "MIT",
      },
    },
    servers: [
      {
        url: baseUrl,
        description: "Current Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Bearer token authentication using ADMIN_PASSWORD",
        },
        tokenHeader: {
          type: "apiKey",
          in: "header",
          name: "token",
          description: "Custom token header authentication",
        },
        sessionToken: {
          type: "apiKey",
          in: "header",
          name: "X-Session-Token",
          description: "Session token after initial authentication",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: { type: "string", example: "Error message" },
            reason: { type: "string", example: "Detailed reason (optional)" },
          },
        },
        HealthResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            status: { type: "string", example: "healthy" },
            timestamp: { type: "string", format: "date-time" },
            uptime: {
              type: "object",
              properties: {
                seconds: { type: "number" },
                hours: { type: "number" },
                formatted: { type: "string" },
              },
            },
            connections: {
              type: "object",
              properties: {
                active: { type: "number" },
                total: { type: "number" },
              },
            },
            memory: {
              type: "object",
              properties: {
                heapUsedMB: { type: "number" },
                heapTotalMB: { type: "number" },
                percent: { type: "number" },
                rssMB: { type: "number" },
              },
            },
            relay: {
              type: "object",
              properties: {
                pub: { type: "string" },
                name: { type: "string" },
                host: { type: "string" },
                port: { type: "number" },
              },
            },
            services: {
              type: "object",
              properties: {
                gun: { type: "string" },
                ipfs: { type: "string" },
              },
            },
          },
        },
        // DealsStats, RegistryParams, OnChainRelays removed
        IPFSUploadResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            cid: { type: "string", description: "IPFS CID of uploaded file" },
            file: {
              type: "object",
              properties: {
                hash: { type: "string", description: "IPFS hash (same as cid)" },
                name: { type: "string", description: "Original filename" },
                size: { type: "number", description: "File size in bytes" },
                mimetype: { type: "string", description: "MIME type" },
              },
            },
            authType: {
              type: "string",
              enum: ["admin", "apiKey"],
              description: "Authentication type used",
            },
          },
        },
        IPFSDirectoryUploadResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            cid: { type: "string", description: "Directory CID" },
            directoryCid: { type: "string", description: "Directory CID (same as cid)" },
            fileCount: { type: "number", description: "Number of files uploaded" },
            totalSize: { type: "number", description: "Total size in bytes" },
            totalSizeMB: { type: "number", description: "Total size in MB" },
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  path: { type: "string", description: "Relative path within directory" },
                  size: { type: "number" },
                  mimetype: { type: "string" },
                },
              },
            },
            authType: { type: "string", enum: ["admin", "apiKey"] },
          },
        },
        // IPFSPinList removed
        // X402Tiers, AnnasArchiveStatus, X402Subscription removed
      },
    },
    security: [{ bearerAuth: [] }, { tokenHeader: [] }, { sessionToken: [] }],
    paths: {
      "/health": {
        get: {
          tags: ["Health & Status"],
          summary: "Health check",
          description: "Health check endpoint with detailed system status",
          operationId: "getHealth",
          responses: {
            "200": {
              description: "System health status",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                },
              },
            },
          },
        },
      },
      "/api/v1/system/stats": {
        get: {
          tags: ["System"],
          summary: "System statistics",
          description: "Get detailed system statistics",
          operationId: "getSystemStats",
          security: [{ bearerAuth: [] }, { tokenHeader: [] }],
          responses: {
            "200": {
              description: "System statistics",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/system/contracts": {
        get: {
          tags: ["System"],
          summary: "Get contract addresses",
          description: "Get the addresses of all protocol contracts for the current chain",
          operationId: "getContracts",
          responses: {
            "200": {
              description: "Contract addresses",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      chainId: { type: "number" },
                      contracts: {
                        type: "object",
                        additionalProperties: { type: "string" },
                      },
                      timestamp: { type: "number" },
                    },
                  },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      // Deals and Torrent paths removed
      "/api/v1/user-uploads/system-hashes-map": {
        get: {
          tags: ["User Uploads"],
          summary: "Get system hashes map",
          description:
            "Get the complete system hashes map with metadata for all files. Returns all file metadata stored in the GunDB systemhash node.",
          operationId: "getSystemHashesMap",
          security: [{ bearerAuth: [] }, { tokenHeader: [] }],
          responses: {
            "200": {
              description: "System hashes map with metadata",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      systemHashes: {
                        type: "object",
                        description: "Map of CID to metadata objects",
                        additionalProperties: {
                          type: "object",
                          properties: {
                            hash: { type: "string" },
                            userAddress: { type: "string" },
                            timestamp: { type: "number" },
                            uploadedAt: { type: "number" },
                            fileName: { type: "string" },
                            displayName: { type: "string" },
                            originalName: { type: "string" },
                            fileSize: { type: "number" },
                            contentType: { type: "string" },
                            isEncrypted: { type: "boolean" },
                            isDirectory: { type: "boolean" },
                            fileCount: { type: "number" },
                            files: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  name: { type: "string" },
                                  path: { type: "string" },
                                  size: { type: "number" },
                                  mimetype: { type: "string" },
                                  originalName: { type: "string" },
                                  isEncrypted: { type: "boolean" },
                                },
                              },
                            },
                            relayUrl: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid address",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      // Registry paths removed
      "/api/v1/ipfs/upload": {
        post: {
          tags: ["IPFS"],
          summary: "Upload file to IPFS",
          description: `Upload a single file to IPFS. Supports two authentication methods:
1. **Admin Upload**: Use \`Authorization: Bearer <ADMIN_PASSWORD>\` (no signature required)
2. **API Key Upload**: Use \`X-API-Key\` header.`,
          operationId: "uploadToIPFS",
          security: [{ bearerAuth: [] }, { tokenHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: {
                      type: "string",
                      format: "binary",
                      description: "File to upload",
                    },
                    encrypted: {
                      type: "string",
                      description: "Set to 'true' if file is encrypted",
                      enum: ["true", "false"],
                    },
                    encryptionMethod: {
                      type: "string",
                      description: "Encryption method (e.g., 'SEA')",
                    },
                    encryptionToken: {
                      type: "string",
                      description: "Encryption token (signature) for encrypted files",
                    },
                  },
                  required: ["file"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "File uploaded successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IPFSUploadResponse" },
                },
              },
            },
            "401": {
              description: "Unauthorized - Missing or invalid authentication",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/Error" },
                      {
                        type: "object",
                        properties: {
                          hint: {
                            type: "string",
                            example:
                              "Sign 'I Love Shogun' with your wallet and provide X-Wallet-Signature header",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            "402": {
              description: "Storage limit exceeded",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/ipfs/upload-directory": {
        post: {
          tags: ["IPFS"],
          summary: "Upload directory to IPFS",
          description:
            "Upload multiple files as a directory to IPFS. Maintains directory structure using relative paths. Files are uploaded with wrap-with-directory=true to preserve structure.",
          operationId: "uploadDirectoryToIPFS",
          security: [{ bearerAuth: [] }, { tokenHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    files: {
                      type: "array",
                      items: {
                        type: "string",
                        format: "binary",
                      },
                      description:
                        "Multiple files with relative paths (e.g., index.html, css/style.css, js/app.js)",
                    },
                  },
                  required: ["files"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Directory uploaded successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/IPFSDirectoryUploadResponse" },
                },
              },
            },
            "400": {
              description: "Bad request - no files provided",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "402": {
              description: "Storage limit exceeded",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "500": {
              description: "Server error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/ipfs/cat/{cid}": {
        get: {
          tags: ["IPFS"],
          summary: "Get IPFS content",
          description: "Retrieve file content from IPFS by CID",
          operationId: "getIPFSContent",
          parameters: [
            {
              name: "cid",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "IPFS CID",
            },
            {
              name: "json",
              in: "query",
              schema: { type: "boolean" },
              description: "Return as JSON if content is JSON",
            },
          ],
          responses: {
            "200": {
              description: "File content",
              content: {
                "application/octet-stream": {
                  schema: { type: "string", format: "binary" },
                },
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
            "404": {
              description: "CID not found",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/ipfs/cat/{cid}/json": {
        get: {
          tags: ["IPFS"],
          summary: "Get IPFS content as JSON",
          description: "Retrieve IPFS content and parse as JSON",
          operationId: "getIPFSContentAsJSON",
          parameters: [
            {
              name: "cid",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "IPFS CID",
            },
          ],
          responses: {
            "200": {
              description: "JSON content",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
          },
        },
      },
      "/api/v1/ipfs/pin/add": {
        post: {
          tags: ["IPFS"],
          summary: "Pin CID to IPFS",
          description: "Pin a CID to IPFS",
          operationId: "pinIPFS",
          security: [{ bearerAuth: [] }, { tokenHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    cid: {
                      type: "string",
                      description: "IPFS CID to pin",
                    },
                  },
                  required: ["cid"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "CID pinned successfully",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/ipfs/pin/ls": {
        get: {
          tags: ["IPFS"],
          summary: "List pinned CIDs",
          description: "List all pinned CIDs",
          operationId: "listPinnedIPFS",
          security: [{ bearerAuth: [] }, { tokenHeader: [] }],
          responses: {
            "200": {
              description: "List of pinned CIDs",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      pins: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/ipfs/pin/rm": {
        post: {
          tags: ["IPFS"],
          summary: "Unpin CID from IPFS",
          description: "Remove a pin from IPFS",
          operationId: "unpinIPFS",
          security: [{ bearerAuth: [] }, { tokenHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    cid: {
                      type: "string",
                      description: "IPFS CID to unpin",
                    },
                  },
                  required: ["cid"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "CID unpinned successfully",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/ipfs/status": {
        get: {
          tags: ["IPFS"],
          summary: "IPFS status",
          description: "Get IPFS node status and connection info",
          operationId: "getIPFSStatus",
          responses: {
            "200": {
              description: "IPFS status",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
          },
        },
      },
      // x402 paths removed
      // Additional Deals paths removed

      "/api/v1/user-uploads/save-system-hash": {
        post: {
          tags: ["User Uploads"],
          summary: "Save file metadata to system hash map",
          description:
            "Save file or directory metadata to the GunDB systemhash node. Used by drive applications to track file metadata.",
          operationId: "saveSystemHash",
          security: [{ bearerAuth: [] }, { tokenHeader: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["hash", "userAddress"],
                  properties: {
                    hash: { type: "string", description: "IPFS CID" },
                    userAddress: { type: "string", description: "User identifier" },
                    timestamp: { type: "number", description: "Upload timestamp" },
                    fileName: { type: "string", description: "File name" },
                    displayName: { type: "string", description: "Display name" },
                    originalName: { type: "string", description: "Original file name" },
                    fileSize: { type: "number", description: "File size in bytes" },
                    contentType: { type: "string", description: "MIME type" },
                    isEncrypted: { type: "boolean", description: "Whether file is encrypted" },
                    isDirectory: { type: "boolean", description: "Whether this is a directory" },
                    fileCount: { type: "number", description: "Number of files in directory" },
                    files: {
                      type: "array",
                      description: "File list for directories",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          path: { type: "string" },
                          size: { type: "number" },
                          mimetype: { type: "string" },
                          originalName: { type: "string" },
                          isEncrypted: { type: "boolean" },
                        },
                      },
                    },
                    relayUrl: { type: "string", description: "Relay URL where file is stored" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "System hash saved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      hash: { type: "string" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - missing required fields",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "500": {
              description: "Server error - GunDB not available",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },

      "/api/v1/user-uploads/remove-system-hash/{cid}": {
        delete: {
          tags: ["User Uploads"],
          summary: "Remove file metadata from system hash map",
          description:
            "Remove file metadata from the GunDB systemhash node. Used when deleting files from drive applications.",
          operationId: "removeSystemHash",
          security: [{ bearerAuth: [] }, { tokenHeader: [] }],
          parameters: [
            {
              name: "cid",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "IPFS CID to remove",
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    userAddress: {
                      type: "string",
                      description: "User identifier (defaults to 'drive-user')",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Metadata removed successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      hash: { type: "string" },
                      userAddress: { type: "string" },
                      timestamp: { type: "number" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - CID required",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "500": {
              description: "Server error - GunDB not available",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/api/v1/visualGraph": {
        get: {
          tags: ["Visual Graph"],
          summary: "Visual Graph Interface",
          description: "Get the visual graph HTML interface",
          operationId: "getVisualGraph",
          responses: {
            "200": {
              description: "Visual Graph HTML",
              content: {
                "text/html": {
                  schema: {
                    type: "string",
                  },
                },
              },
            },
            "404": {
              description: "Not found",
              content: {
                "text/plain": {
                  schema: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  };
}
