import { azure, createPromiseTableService } from 'azure-table-promise'
import { BlockBlobService, TableOperation, TableWriterBatch } from 'azure-utils'
import { isNullOrUndefined } from 'nhs-core-utils'
import { v3, v4 } from 'uuid'
import { Containers, EnVar, Tables } from '../../common/constants'
import { User } from '../../interfaces/entities/user'
import { ControllerBase } from '../common/controller.interfaces'
import { UsersTableRow } from './users.interfaces'
import { hashPassword } from './users.service'

export class DefaultUsersController implements ControllerBase<User> {
  blockBlobService: BlockBlobService
  tableWriterBatch: TableWriterBatch

  constructor (azureConnectionString: string) {
    this.blockBlobService = new BlockBlobService(azureConnectionString)
  }

  async doPost (filters: any): Promise<User[]> {
    throw new Error('Method not implemented.')
  }

  async doGet (): Promise<User[]> {
    throw new Error('Method not implemented.')
  }

  async doPut (object: User): Promise<User> {
    object.id = v3(object.username, 'user')
    object.password = v3(object.password, process.env[EnVar.Pepper])
    return await this.execute(object, 'merge')
  }

  async doPatch (object: User, replace?: boolean): Promise<User> {
    return await this.execute(object, 'merge')
  }

  async doDelete (object: User): Promise<{success: boolean, messages: string[]}> {
    const promiseTableService = createPromiseTableService(process.env[EnVar.StorageAccount])
    const query = new azure.TableQuery().select().where('RowKey eq ?', object.id)
    const results = await promiseTableService.queryEntitiesAll<UsersTableRow>(Tables.Users, query, { resolveEntity: true })
    const records: UsersTableRow[] = results.entries

    if (isNullOrUndefined(records) || records.length === 0) {
      return {
        success: false,
        messages: ['Delete operation failed due to lack of existing data.']
      }
    }

    await this.execute(object, 'delete')

    return {
      success: true,
      messages: ['Successful delete operation.']
    }
  }

  private async exists (object: User): Promise<boolean> {
    const promiseTableService = createPromiseTableService(process.env[EnVar.StorageAccount])
    const query = new azure.TableQuery().select('RowKey').where('id eq ?', object.id)
    throw new Error('Method not implemented.')
  }

  private async execute (object: User, writeType: TableOperation): Promise<User> {
    const dataPath = `${object.id}.json`

    if (writeType === 'delete') {
      await this.blockBlobService.delete(Containers.Users, dataPath)
    } else {
      await this.blockBlobService.write(Containers.Users, dataPath, object)
    }

    const userTableRow: UsersTableRow = {
      PartitionKey: 'users',
      RowKey: object.id,
      salt: object.salt,
      dataPath: dataPath,
      passwordHash: object.password
    }

    this.tableWriterBatch = new TableWriterBatch({ connection: process.env[EnVar.StorageAccount] })
    this.tableWriterBatch.addTableWriter({
      tableName: Tables.Users,
      tableRows: [userTableRow],
      writeType
    })
    await this.tableWriterBatch.executeBatches()

    return object
  }
}
