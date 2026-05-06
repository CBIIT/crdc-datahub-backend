/**
 * Data View (getSubmissionNodes) builds `properties` from _processSubmissionNodes.
 * Column names are the union of the current page, and when the list is paginated across
 * multiple pages—distinct parent relationship keys (`getDistinctParentRelationshipKeys`)
 * and top-level `props` keys (`getDistinctPropsTopLevelKeys`). The latter are skipped
 * when `first === -1` or the first page already includes every row (`offset === 0` and
 * `total <= first`). The final `properties` array is sorted alphabetically.
 *
 * @see services/submission.js — _processSubmissionNodes, listSubmissionNodes
 */

const { Submission } = require('../../services/submission');
const { VALIDATION_STATUS } = require('../../constants/submission-constants');
const { verifySession } = require('../../verifier/user-info-verifier');

jest.mock('../../verifier/user-info-verifier', () => ({
  verifySession: jest.fn()
}));

const REL_SAMPLE = 'sample.sample_id';
const REL_PARTICIPANT = 'participant.study_participant_id';

function createMockUserScope(allowView = true) {
  return {
    isNoneScope: jest.fn().mockReturnValue(!allowView)
  };
}

function baseNode(overrides = {}) {
  return {
    submissionID: 'sub-1',
    nodeType: 'study_diagnosis',
    nodeID: 'sd-1',
    IDPropName: 'study_diagnosis_id',
    status: VALIDATION_STATUS.PASSED,
    props: { study_diagnosis_id: 'SD1' },
    parents: [],
    orginalFileName: 'diagnosis.tsv',
    lineNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function buildSubmissionService() {
  const mockOrganizationService = { organizationCollection: {} };
  const submissionService = new Submission(
    {},
    {},
    {},
    {},
    mockOrganizationService,
    {},
    {},
    jest.fn(),
    {},
    'test-queue',
    {},
    {},
    [],
    [],
    {},
    'test-loader',
    {},
    {},
    'test-bucket',
    {},
    {},
    new Map(),
    {},
    {},
    {}
  );
  return submissionService;
}

describe('Submission _processSubmissionNodes (Data View properties)', () => {
  let submissionService;

  beforeEach(() => {
    jest.clearAllMocks();
    verifySession.mockReturnValue({
      verifyInitialized: jest.fn()
    });
    submissionService = buildSubmissionService();
  });

  it('includes both relationship keys when the current page has both parent patterns', () => {
    const withSample = baseNode({
      nodeID: 'sd-1',
      parents: [
        { parentType: 'sample', parentIDPropName: 'sample_id', parentIDValue: 'SAM1' }
      ],
      props: { study_diagnosis_id: 'SD1' }
    });
    const withParticipant = baseNode({
      nodeID: 'sd-2',
      parents: [
        {
          parentType: 'participant',
          parentIDPropName: 'study_participant_id',
          parentIDValue: 'P1'
        }
      ],
      props: { study_diagnosis_id: 'SD2' }
    });

    const out = submissionService._processSubmissionNodes({
      total: 2,
      results: [withSample, withParticipant]
    });

    expect(out.properties).toEqual([
      REL_PARTICIPANT,
      REL_SAMPLE,
      'study_diagnosis_id'
    ]);
    expect(out.total).toBe(2);
  });

  it('includes both relationship keys on a single row when parents lists two parent types', () => {
    const bothParents = baseNode({
      nodeID: 'sd-both',
      parents: [
        { parentType: 'sample', parentIDPropName: 'sample_id', parentIDValue: 'SAM1' },
        {
          parentType: 'participant',
          parentIDPropName: 'study_participant_id',
          parentIDValue: 'P1'
        }
      ],
      props: { study_diagnosis_id: 'SDBOTH' }
    });

    const out = submissionService._processSubmissionNodes({
      total: 1,
      results: [bothParents]
    });

    expect(out.properties).toEqual([
      REL_PARTICIPANT,
      REL_SAMPLE,
      'study_diagnosis_id'
    ]);
    expect(out.total).toBe(1);
  });

  it('merges submission-wide relationship keys so columns include parents not on the current page', () => {
    // Page: only sample parents; third arg mirrors submission-wide keys (e.g. other pages have
    // participant links).
    const pageNodes = [
      baseNode({
        nodeID: 'sd-a',
        parents: [
          { parentType: 'sample', parentIDPropName: 'sample_id', parentIDValue: 'SAM1' }
        ],
        props: { study_diagnosis_id: 'SDA' }
      }),
      baseNode({
        nodeID: 'sd-b',
        parents: [
          { parentType: 'sample', parentIDPropName: 'sample_id', parentIDValue: 'SAM2' }
        ],
        props: { study_diagnosis_id: 'SDB' }
      })
    ];

    const out = submissionService._processSubmissionNodes(
      { total: 200, results: pageNodes },
      null,
      [REL_PARTICIPANT]
    );

    expect(out.properties).toEqual([
      REL_PARTICIPANT,
      REL_SAMPLE,
      'study_diagnosis_id'
    ]);
  });
});

describe('Submission listSubmissionNodes (Data View, paginated path)', () => {
  let submissionService;
  const mockSubmission = {
    _id: 'sub-1',
    bucketName: 'b',
    rootPath: 'p'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    verifySession.mockReturnValue({
      verifyInitialized: jest.fn()
    });
    submissionService = buildSubmissionService();
    submissionService._findByID = jest.fn().mockResolvedValue(mockSubmission);
    submissionService._getUserScope = jest.fn().mockResolvedValue(createMockUserScope(true));
  });

  it('merges distinct relationship keys, distinct props keys, and the current page for listSubmissionNodes', async () => {
    const sampleOnlyPage = {
      total: 200,
      results: [
        baseNode({
          nodeID: 'sd-1',
          parents: [
            { parentType: 'sample', parentIDPropName: 'sample_id', parentIDValue: 'SAM1' }
          ],
          props: { study_diagnosis_id: 'SD1' }
        })
      ]
    };

    submissionService.dataRecordDAO.getSubmissionNodes = jest
      .fn()
      .mockResolvedValue(sampleOnlyPage);
    submissionService.dataRecordDAO.getDistinctParentRelationshipKeys = jest
      .fn()
      .mockResolvedValue([REL_SAMPLE, REL_PARTICIPANT]);
    submissionService.dataRecordDAO.getDistinctPropsTopLevelKeys = jest
      .fn()
      .mockResolvedValue([]);

    const params = {
      submissionID: 'sub-1',
      nodeType: 'study_diagnosis',
      status: 'All',
      first: 10,
      offset: 0,
      orderBy: 'nodeID',
      sortDirection: 'ASC'
    };
    const context = { userInfo: { _id: 'u1' } };

    const out = await submissionService.listSubmissionNodes(params, context);

    expect(submissionService.dataRecordDAO.getSubmissionNodes).toHaveBeenCalledWith(
      'sub-1',
      'study_diagnosis',
      10,
      0,
      'nodeID',
      'ASC',
      expect.objectContaining({
        submissionID: 'sub-1',
        nodeType: 'study_diagnosis'
      })
    );
    expect(submissionService.dataRecordDAO.getDistinctParentRelationshipKeys).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionID: 'sub-1',
        nodeType: 'study_diagnosis'
      })
    );
    expect(submissionService.dataRecordDAO.getDistinctPropsTopLevelKeys).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionID: 'sub-1',
        nodeType: 'study_diagnosis'
      })
    );

    expect(out.properties).toEqual([
      REL_PARTICIPANT,
      REL_SAMPLE,
      'study_diagnosis_id'
    ]);
  });

  it('uses a safe RegExp for nodeID when the search term contains regex metacharacters', async () => {
    submissionService.dataRecordDAO.getSubmissionNodes = jest.fn().mockResolvedValue({ total: 0, results: [] });
    submissionService.dataRecordDAO.getDistinctParentRelationshipKeys = jest.fn().mockResolvedValue([]);
    submissionService.dataRecordDAO.getDistinctPropsTopLevelKeys = jest.fn().mockResolvedValue([]);

    await submissionService.listSubmissionNodes(
      {
        submissionID: 'sub-1',
        nodeType: 'study_diagnosis',
        status: 'All',
        nodeID: '*',
        first: 10,
        offset: 0,
        orderBy: 'nodeID',
        sortDirection: 'ASC'
      },
      { userInfo: { _id: 'u1' } }
    );

    const queryArg = submissionService.dataRecordDAO.getSubmissionNodes.mock.calls[0][6];
    expect(queryArg.nodeID).toBeInstanceOf(RegExp);
    expect(queryArg.nodeID.source).toBe('\\*');
    expect(queryArg.nodeID.flags).toBe('i');
  });

  it('includes top-level props keys from getDistinctPropsTopLevelKeys when absent on the current page', async () => {
    submissionService.dataRecordDAO.getSubmissionNodes = jest.fn().mockResolvedValue({
      total: 200,
      results: [
        baseNode({
          nodeID: 'sd-1',
          parents: [
            { parentType: 'sample', parentIDPropName: 'sample_id', parentIDValue: 'SAM1' }
          ],
          props: { study_diagnosis_id: 'SD1' }
        })
      ]
    });
    submissionService.dataRecordDAO.getDistinctParentRelationshipKeys = jest.fn().mockResolvedValue([]);
    submissionService.dataRecordDAO.getDistinctPropsTopLevelKeys = jest
      .fn()
      .mockResolvedValue(['only_on_another_page']);

    const out = await submissionService.listSubmissionNodes(
      {
        submissionID: 'sub-1',
        nodeType: 'study_diagnosis',
        status: 'All',
        first: 10,
        offset: 0,
        orderBy: 'nodeID',
        sortDirection: 'ASC'
      },
      { userInfo: { _id: 'u1' } }
    );

    expect(out.properties).toEqual([
      'only_on_another_page',
      REL_SAMPLE,
      'study_diagnosis_id'
    ]);
  });

  it('rejects when getDistinctParentRelationshipKeys fails and submission-wide keys are required', async () => {
    submissionService.dataRecordDAO.getSubmissionNodes = jest.fn().mockResolvedValue({
      total: 200,
      results: [
        baseNode({
          nodeID: 'sd-1',
          parents: [
            { parentType: 'sample', parentIDPropName: 'sample_id', parentIDValue: 'SAM1' }
          ],
          props: { study_diagnosis_id: 'SD1' }
        })
      ]
    });
    submissionService.dataRecordDAO.getDistinctParentRelationshipKeys = jest
      .fn()
      .mockRejectedValue(new Error('aggregate failed'));
    submissionService.dataRecordDAO.getDistinctPropsTopLevelKeys = jest.fn().mockResolvedValue([]);

    await expect(
      submissionService.listSubmissionNodes(
        {
          submissionID: 'sub-1',
          nodeType: 'study_diagnosis',
          status: 'All',
          first: 10,
          offset: 0,
          orderBy: 'nodeID',
          sortDirection: 'ASC'
        },
        { userInfo: { _id: 'u1' } }
      )
    ).rejects.toThrow('aggregate failed');
  });

  it('does not call distinct key aggregations when first is -1 (entire result set in one page)', async () => {
    const allRows = [
      baseNode({ nodeID: 'sd-1' }),
      baseNode({ nodeID: 'sd-2', props: { study_diagnosis_id: 'SD2', extra: 'X' } })
    ];
    submissionService.dataRecordDAO.getSubmissionNodes = jest.fn().mockResolvedValue({
      total: 2,
      results: allRows
    });
    const distinctRel = jest.fn().mockResolvedValue([REL_PARTICIPANT]);
    const distinctProps = jest.fn().mockResolvedValue(['should_not_appear_unless_ran']);
    submissionService.dataRecordDAO.getDistinctParentRelationshipKeys = distinctRel;
    submissionService.dataRecordDAO.getDistinctPropsTopLevelKeys = distinctProps;

    const out = await submissionService.listSubmissionNodes(
      {
        submissionID: 'sub-1',
        nodeType: 'study_diagnosis',
        status: 'All',
        first: -1,
        offset: 0,
        orderBy: 'nodeID',
        sortDirection: 'ASC'
      },
      { userInfo: { _id: 'u1' } }
    );

    expect(submissionService.dataRecordDAO.getSubmissionNodes).toHaveBeenCalledWith(
      'sub-1',
      'study_diagnosis',
      -1,
      0,
      'nodeID',
      'ASC',
      expect.objectContaining({ submissionID: 'sub-1', nodeType: 'study_diagnosis' })
    );
    expect(distinctRel).not.toHaveBeenCalled();
    expect(distinctProps).not.toHaveBeenCalled();
    expect(out.properties).toEqual(['extra', 'study_diagnosis_id']);
  });

  it('does not call distinct key aggregations when the first page contains all rows (total <= first)', async () => {
    const page = {
      total: 3,
      results: [
        baseNode({ nodeID: 'sd-1' }),
        baseNode({ nodeID: 'sd-2' }),
        baseNode({ nodeID: 'sd-3' })
      ]
    };
    submissionService.dataRecordDAO.getSubmissionNodes = jest.fn().mockResolvedValue(page);
    const distinctRel = jest.fn().mockResolvedValue([REL_PARTICIPANT]);
    const distinctProps = jest.fn().mockResolvedValue(['phantom_key']);
    submissionService.dataRecordDAO.getDistinctParentRelationshipKeys = distinctRel;
    submissionService.dataRecordDAO.getDistinctPropsTopLevelKeys = distinctProps;

    const out = await submissionService.listSubmissionNodes(
      {
        submissionID: 'sub-1',
        nodeType: 'study_diagnosis',
        status: 'All',
        first: 20,
        offset: 0,
        orderBy: 'nodeID',
        sortDirection: 'ASC'
      },
      { userInfo: { _id: 'u1' } }
    );

    expect(distinctRel).not.toHaveBeenCalled();
    expect(distinctProps).not.toHaveBeenCalled();
    expect(out.properties).toEqual(['study_diagnosis_id']);
  });

  it('still runs distinct key aggregations when offset > 0 (another page of rows can exist)', async () => {
    submissionService.dataRecordDAO.getSubmissionNodes = jest.fn().mockResolvedValue({
      total: 3,
      results: [baseNode({ nodeID: 'sd-2' })]
    });
    const distinctRel = jest.fn().mockResolvedValue([REL_PARTICIPANT]);
    const distinctProps = jest.fn().mockResolvedValue([]);
    submissionService.dataRecordDAO.getDistinctParentRelationshipKeys = distinctRel;
    submissionService.dataRecordDAO.getDistinctPropsTopLevelKeys = distinctProps;

    await submissionService.listSubmissionNodes(
      {
        submissionID: 'sub-1',
        nodeType: 'study_diagnosis',
        status: 'All',
        first: 1,
        offset: 1,
        orderBy: 'nodeID',
        sortDirection: 'ASC'
      },
      { userInfo: { _id: 'u1' } }
    );

    expect(distinctRel).toHaveBeenCalled();
    expect(distinctProps).toHaveBeenCalled();
  });
});
